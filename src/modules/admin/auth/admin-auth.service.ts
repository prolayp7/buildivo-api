import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedAdmin } from '../../../common/admin/admin-request';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async issueTokenPair(adminUserId: number): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync({ sub: adminUserId });
    const refreshToken = randomBytes(48).toString('hex');

    await this.prisma.adminRefreshToken.create({
      data: {
        adminUserId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }

  async login(email: string, password: string): Promise<TokenPair & { adminUser: AuthenticatedAdmin }> {
    const adminUser = await this.prisma.adminUser.findFirst({
      where: { email, deletedAt: null, status: 'ACTIVE' },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!adminUser) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, adminUser.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.adminUser.update({
      where: { id: adminUser.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokenPair(adminUser.id);
    return {
      ...tokens,
      adminUser: {
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        roleId: adminUser.roleId,
        permissionKeys: adminUser.role.permissions.map((rp) => rp.permission.key),
      },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.adminRefreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.adminRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const adminUser = await this.prisma.adminUser.findFirst({
      where: { id: stored.adminUserId, deletedAt: null, status: 'ACTIVE' },
    });

    if (!adminUser) {
      throw new UnauthorizedException('Admin user not found or disabled');
    }

    return this.issueTokenPair(stored.adminUserId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.adminRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(adminUserId: number): Promise<AuthenticatedAdmin> {
    const adminUser = await this.prisma.adminUser.findFirst({
      where: { id: adminUserId, deletedAt: null },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!adminUser) {
      throw new UnauthorizedException('Admin user not found');
    }

    return {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      roleId: adminUser.roleId,
      permissionKeys: adminUser.role.permissions.map((rp) => rp.permission.key),
    };
  }

  async updateAccount(adminUserId: number, input: { name?: string; email?: string }): Promise<AuthenticatedAdmin> {
    const email = input.email?.trim().toLowerCase();
    if (email) {
      const existing = await this.prisma.adminUser.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, id: { not: adminUserId }, deletedAt: null },
      });
      if (existing) throw new ConflictException('That email address is already in use');
    }
    await this.prisma.adminUser.update({
      where: { id: adminUserId },
      data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(email ? { email } : {}) },
    });
    return this.me(adminUserId);
  }

  async changePassword(adminUserId: number, currentPassword: string, newPassword: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminUserId } });
    if (!admin || !(await bcrypt.compare(currentPassword, admin.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, admin.passwordHash)) {
      throw new ConflictException('Choose a password you have not already used');
    }
    await this.prisma.adminUser.update({
      where: { id: adminUserId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    return { message: 'Password updated successfully' };
  }
}
