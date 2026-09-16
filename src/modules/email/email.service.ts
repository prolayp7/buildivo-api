import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../admin/settings/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LOGO_SRC_PLACEHOLDER, STOREFRONT_URL } from './email-templates';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const FALLBACK_LOGO_URL = `${STOREFRONT_URL}/images/logo/rigforge-logo-full.png`;

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string | { name: string; address: string };
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  // The admin-uploaded logo is stored as a relative /uploads/ path (served by
  // this API), so emails - opened outside any app context - need it resolved
  // to a publicly reachable URL. Falls back to the storefront's bundled logo
  // if nothing's configured or the lookup fails.
  private async logoUrl(): Promise<string> {
    try {
      const row = await this.prisma.setting.findUnique({ where: { key: 'general.site' } });
      const logo = (row?.value as Record<string, unknown> | undefined)?.logo;
      if (typeof logo !== 'string' || !logo) return FALLBACK_LOGO_URL;
      return logo.startsWith('/uploads/') ? `${API_URL}${logo}` : logo;
    } catch {
      return FALLBACK_LOGO_URL;
    }
  }

  private async config(): Promise<SmtpConfig | null> {
    const integration = await this.settings.internalIntegration('email.smtp');
    const cfg = integration?.settings as Record<string, unknown> | undefined;
    const user = cfg?.username || cfg?.user;
    const pass = cfg?.password || cfg?.pass;
    if (!cfg?.host || !cfg?.port || !user || !pass) return null;
    const address = String(cfg.fromEmail || cfg.fromAddress || user);
    return {
      host: String(cfg.host),
      port: Number(cfg.port),
      secure: Boolean(cfg.secure ?? Number(cfg.port) === 465),
      user: String(user),
      pass: String(pass),
      from: cfg.fromName ? { name: String(cfg.fromName), address } : address,
    };
  }

  // Best-effort: never throws. Callers fire-and-forget this so a slow/broken
  // SMTP relay never blocks or fails checkout/admin/refund/notification flows.
  // Returns false when SMTP isn't configured (the current default state) or
  // the send itself failed - both are logged, neither is fatal to the caller.
  async send(to: string, subject: string, html: string): Promise<boolean> {
    const cfg = await this.config();
    if (!cfg) {
      this.logger.warn(`Email not sent (SMTP not configured): "${subject}" to ${to}`);
      return false;
    }
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
      });
      const resolvedHtml = html.includes(LOGO_SRC_PLACEHOLDER) ? html.replace(LOGO_SRC_PLACEHOLDER, await this.logoUrl()) : html;
      await transporter.sendMail({ from: cfg.from, to, subject, html: resolvedHtml });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to send email "${subject}" to ${to}: ${(error as Error).message}`);
      return false;
    }
  }
}
