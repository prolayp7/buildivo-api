import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { newsletterSubscribedEmail } from '../../email/email-templates';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async subscribe(email: string) {
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email } });
    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    if (!existing) {
      const message = newsletterSubscribedEmail();
      void this.emailService.send(email, message.subject, message.html);
    }
    return { subscribed: true };
  }
}
