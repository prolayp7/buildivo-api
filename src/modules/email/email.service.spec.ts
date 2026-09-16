import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer');

const prisma = { setting: { findUnique: jest.fn().mockResolvedValue(null) } };

describe('EmailService', () => {
  afterEach(() => jest.clearAllMocks());

  it('no-ops and returns false when SMTP is not configured', async () => {
    const settings = { internalIntegration: jest.fn().mockResolvedValue(null) };
    const service = new EmailService(settings as never, prisma as never);

    const result = await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(result).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('no-ops when the integration exists but is missing required fields', async () => {
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({ mode: 'SANDBOX', settings: { host: 'smtp.example.com' } }),
    };
    const service = new EmailService(settings as never, prisma as never);

    const result = await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(result).toBe(false);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('sends via the configured SMTP transport', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX',
        settings: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'secret', fromAddress: 'shop@example.com' },
      }),
    };
    const service = new EmailService(settings as never, prisma as never);

    const result = await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(result).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user@example.com', pass: 'secret' },
    });
    expect(sendMail).toHaveBeenCalledWith({ from: 'shop@example.com', to: 'customer@example.com', subject: 'Subject', html: '<p>hi</p>' });
  });

  it('uses the SMTP field names saved by the admin panel', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({ settings: {
        host: 'smtp.gmail.com', port: 587,
        username: 'store@example.com', password: 'app-password',
        fromEmail: 'store@example.com', fromName: 'RigForge',
      } }),
    };
    const service = new EmailService(settings as never, prisma as never);

    await expect(service.send('customer@example.com', 'Welcome', '<p>Hello</p>')).resolves.toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.gmail.com', port: 587, secure: false,
      auth: { user: 'store@example.com', pass: 'app-password' },
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: 'RigForge', address: 'store@example.com' },
    }));
  });

  it('falls back to the SMTP user as the from-address when fromAddress is not set', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX',
        settings: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'secret' },
      }),
    };
    const service = new EmailService(settings as never, prisma as never);

    await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'user@example.com' }));
  });

  it('defaults secure to true for port 465', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX',
        settings: { host: 'smtp.example.com', port: 465, user: 'user@example.com', pass: 'secret' },
      }),
    };
    const service = new EmailService(settings as never, prisma as never);

    await service.send('customer@example.com', 'Subject', '<p>hi</p>');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true }));
  });

  it('swallows transporter errors and returns false rather than throwing', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('connection refused'));
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        mode: 'SANDBOX',
        settings: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'secret' },
      }),
    };
    const service = new EmailService(settings as never, prisma as never);

    await expect(service.send('customer@example.com', 'Subject', '<p>hi</p>')).resolves.toBe(false);
  });

  it('resolves the logo placeholder to the admin-uploaded logo, as an absolute URL', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        settings: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'secret' },
      }),
    };
    const prismaWithLogo = { setting: { findUnique: jest.fn().mockResolvedValue({ value: { logo: '/uploads/logo-abc.webp' } }) } };
    const service = new EmailService(settings as never, prismaWithLogo as never);

    await service.send('customer@example.com', 'Subject', '<img src="{{EMAIL_LOGO_SRC}}">');

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ html: '<img src="http://localhost:3000/uploads/logo-abc.webp">' }));
  });

  it('falls back to the storefront logo when no admin logo is configured', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    const settings = {
      internalIntegration: jest.fn().mockResolvedValue({
        settings: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'secret' },
      }),
    };
    const service = new EmailService(settings as never, prisma as never);

    await service.send('customer@example.com', 'Subject', '<img src="{{EMAIL_LOGO_SRC}}">');

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ html: '<img src="http://localhost:3002/images/logo/rigforge-logo-full.png">' }));
  });
});
