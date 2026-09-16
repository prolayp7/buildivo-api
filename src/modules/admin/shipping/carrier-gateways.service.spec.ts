import { ServiceUnavailableException } from '@nestjs/common';
import { CarrierGatewaysService } from './carrier-gateways.service';

describe('CarrierGatewaysService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejects a carrier that has not been configured', async () => {
    const settings = { internalIntegration: jest.fn().mockResolvedValue(null) };
    const service = new CarrierGatewaysService(settings as never);

    await expect(service.test('FEDEX')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('authenticates FedEx against its sandbox without exposing the token', async () => {
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX', settings: { clientId: 'client-id', clientSecret: 'client-secret' },
      }),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      access_token: 'must-not-be-returned', expires_in: 3600, token_type: 'bearer',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const service = new CarrierGatewaysService(settings as never);

    const result = await service.test('FEDEX');

    expect(result).toMatchObject({ carrier: 'FEDEX', mode: 'SANDBOX', connected: true, tokenExpiresInSeconds: 3600 });
    expect(JSON.stringify(result)).not.toContain('must-not-be-returned');
    expect(fetch).toHaveBeenCalledWith('https://apis-sandbox.fedex.com/oauth/token', expect.objectContaining({ method: 'POST' }));
  });
});
