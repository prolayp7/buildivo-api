import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { EmailService } from '../../email/email.service';
import { notificationEmail } from '../../email/email-templates';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(adminUserId: number, dto: CreateNotificationDto) {
    let user: { id: number; email: string } | null = null;
    if (dto.userId) {
      user = await this.prisma.user.findFirst({ where: { id: dto.userId, deletedAt: null }, select: { id: true, email: true } });
      if (!user) throw new NotFoundException('Customer not found');
    }

    const notification = await this.prisma.notification.create({
      data: { ...dto, adminUserId, metadata: dto.metadata as Prisma.InputJsonValue | undefined },
    });

    // basic marketing/announcement hook: any notification aimed at a specific
    // customer also gets emailed to them, best-effort
    if (user) {
      const email = notificationEmail({ title: dto.title, message: dto.message });
      void this.emailService.send(user.email, email.subject, email.html);
    }

    return notification;
  }
}
