import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { PaypalGatewayService } from './paypal-gateway.service';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('PaypalGatewayService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects when PayPal has not been configured', async () => {
    const settings = { internalIntegration: jest.fn().mockResolvedValue(null) };
    const service = new PaypalGatewayService(settings as never);

    await expect(service.credentials()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects when a required PayPal setting is missing', async () => {
    const settings = { internalIntegration: jest.fn().mockResolvedValue({ mode: 'SANDBOX', settings: { clientId: 'id' } }) };
    const service = new PaypalGatewayService(settings as never);

    await expect(service.credentials()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fetches an access token from the sandbox host using Basic auth', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ access_token: 'A-TOKEN', expires_in: 32400 }));
    const service = new PaypalGatewayService({} as never);

    const token = await service.accessToken({ mode: 'SANDBOX', clientId: 'cid', clientSecret: 'csecret' });

    expect(token).toBe('A-TOKEN');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-m.sandbox.paypal.com/v1/oauth2/token',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: `Basic ${Buffer.from('cid:csecret').toString('base64')}` }) }),
    );
  });

  it('uses the live host when mode is LIVE', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ access_token: 'A-TOKEN' }));
    const service = new PaypalGatewayService({} as never);

    await service.accessToken({ mode: 'LIVE', clientId: 'cid', clientSecret: 'csecret' });

    expect(fetchMock).toHaveBeenCalledWith('https://api-m.paypal.com/v1/oauth2/token', expect.anything());
  });

  it('raises a gateway error when PayPal rejects the credentials', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ error: 'invalid_client', error_description: 'bad creds' }, 401));
    const service = new PaypalGatewayService({} as never);

    await expect(service.accessToken({ mode: 'SANDBOX', clientId: 'cid', clientSecret: 'csecret' })).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('creates an order and extracts the approve link', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      id: 'PAYPAL-ORDER-1',
      links: [
        { rel: 'self', href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/PAYPAL-ORDER-1' },
        { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1' },
      ],
    }));
    const service = new PaypalGatewayService({} as never);

    const result = await service.createOrder({ mode: 'SANDBOX' }, 'A-TOKEN', {
      amount: '103.20', currency: 'GBP', referenceId: 'attempt-uuid', returnUrl: 'https://shop.example/return', cancelUrl: 'https://shop.example/cancel',
    });

    expect(result).toEqual({ id: 'PAYPAL-ORDER-1', approveUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-1' });
  });

  it('raises a gateway error when PayPal omits the approve link', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ id: 'PAYPAL-ORDER-1', links: [] }));
    const service = new PaypalGatewayService({} as never);

    await expect(
      service.createOrder({ mode: 'SANDBOX' }, 'A-TOKEN', { amount: '1.00', currency: 'GBP', referenceId: 'x', returnUrl: 'x', cancelUrl: 'x' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('captures an order and extracts the capture id', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({
      status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'CAPTURE-1' }] } }],
    }));
    const service = new PaypalGatewayService({} as never);

    const result = await service.captureOrder({ mode: 'SANDBOX' }, 'A-TOKEN', 'PAYPAL-ORDER-1');

    expect(result).toEqual({ status: 'COMPLETED', captureId: 'CAPTURE-1' });
  });

  it('verifies a webhook signature via PayPal, forwarding the transmission headers', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ verification_status: 'SUCCESS' }));
    const service = new PaypalGatewayService({} as never);
    const creds = { mode: 'SANDBOX' as const, clientId: 'cid', clientSecret: 'csecret', webhookId: 'WH-1' };
    const headers = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
      'paypal-transmission-id': 'tx-1',
      'paypal-transmission-sig': 'sig',
      'paypal-transmission-time': '2026-01-01T00:00:00Z',
    };

    const verified = await service.verifyWebhookSignature(creds, 'A-TOKEN', headers, { id: 'evt-1' });

    expect(verified).toBe(true);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ webhook_id: 'WH-1', transmission_id: 'tx-1', webhook_event: { id: 'evt-1' } });
  });

  it('treats a missing transmission header as an unverified signature without calling PayPal', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ verification_status: 'SUCCESS' }));
    const service = new PaypalGatewayService({} as never);
    const creds = { mode: 'SANDBOX' as const, clientId: 'cid', clientSecret: 'csecret', webhookId: 'WH-1' };

    const verified = await service.verifyWebhookSignature(creds, 'A-TOKEN', { 'paypal-auth-algo': 'SHA256withRSA' }, { id: 'evt-1' });

    expect(verified).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a failed verification', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ verification_status: 'FAILURE' }));
    const service = new PaypalGatewayService({} as never);
    const creds = { mode: 'SANDBOX' as const, clientId: 'cid', clientSecret: 'csecret', webhookId: 'WH-1' };
    const headers = {
      'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'x', 'paypal-transmission-id': 'x',
      'paypal-transmission-sig': 'x', 'paypal-transmission-time': 'x',
    };

    await expect(service.verifyWebhookSignature(creds, 'A-TOKEN', headers, {})).resolves.toBe(false);
  });
});
