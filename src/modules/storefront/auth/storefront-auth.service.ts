import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { RegisterDto } from './dto/register.dto';
import { OtpPurpose } from './dto/otp.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { EmailService } from '../../email/email.service';
import { emailVerificationEmail, passwordResetEmail, welcomeEmail } from '../../email/email-templates';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toAuthenticatedCustomer(user: { id: number; uuid: string; email: string; firstName: string; lastName: string }): AuthenticatedCustomer {
  return { id: user.id, uuid: user.uuid, email: user.email, firstName: user.firstName, lastName: user.lastName };
}

@Injectable()
export class StorefrontAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  private async issueTokenPair(userId: number): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync({ sub: userId });
    const refreshToken = randomBytes(48).toString('hex');

    await this.prisma.customerRefreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }

  private async issueOtp(email: string, purpose: OtpPurpose): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.otpVerification.create({
      data: {
        identifier: email.toLowerCase(),
        channel: 'EMAIL',
        code,
        purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    const message = purpose === 'password_reset' ? passwordResetEmail({ code }) : emailVerificationEmail({ code });
    void this.emailService.send(email, message.subject, message.html);
    return code;
  }

  async register(dto: RegisterDto): Promise<TokenPair & { customer: AuthenticatedCustomer; otp?: string }> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) throw new ConflictException('An account with that email already exists');

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone,
      },
    });

    const otp = await this.issueOtp(email, 'email_verification');
    const tokens = await this.issueTokenPair(user.id);

    const welcome = welcomeEmail({ firstName: user.firstName });
    void this.emailService.send(email, welcome.subject, welcome.html);

    return {
      ...tokens,
      customer: toAuthenticatedCustomer(user),
      ...(process.env.NODE_ENV !== 'production' ? { otp } : {}),
    };
  }

  async login(email: string, password: string): Promise<TokenPair & { customer: AuthenticatedCustomer }> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' }, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.issueTokenPair(user.id);
    return { ...tokens, customer: toAuthenticatedCustomer(user) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.customerRefreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.customerRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findFirst({
      where: { id: stored.userId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user) throw new UnauthorizedException('Account not found or disabled');

    return this.issueTokenPair(stored.userId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.customerRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async sendOtp(email: string, purpose: OtpPurpose): Promise<{ message: string; otp?: string }> {
    const otp = await this.issueOtp(email, purpose);
    return { message: 'OTP sent', ...(process.env.NODE_ENV !== 'production' ? { otp } : {}) };
  }

  private async consumeOtp(email: string, purpose: OtpPurpose, code: string) {
    const otp = await this.prisma.otpVerification.findFirst({
      where: { identifier: email.trim().toLowerCase(), purpose, code, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired code');
    }
    await this.prisma.otpVerification.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    return otp;
  }

  async verifyOtp(email: string, purpose: OtpPurpose, code: string): Promise<{ verified: true }> {
    await this.consumeOtp(email, purpose, code);
    if (purpose === 'email_verification') {
      await this.prisma.user.updateMany({
        where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' }, deletedAt: null },
        data: { emailVerifiedAt: new Date() },
      });
    }
    return { verified: true };
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<{ message: string }> {
    await this.consumeOtp(email, 'password_reset', code);
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' }, deletedAt: null },
    });
    if (!user) throw new BadRequestException('Invalid or expired code');

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } }),
      this.prisma.customerRefreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Password reset successfully' };
  }

  async me(userId: number): Promise<AuthenticatedCustomer & { phone: string | null; emailVerified: boolean }> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Account not found');
    return { ...toAuthenticatedCustomer(user), phone: user.phone, emailVerified: !!user.emailVerifiedAt };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
    });
    return this.me(userId);
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    return { message: 'Password updated successfully' };
  }
}
