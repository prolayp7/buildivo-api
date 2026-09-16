import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAdminUsersQueryDto) {
    const page = query.page!; const perPage = query.perPage!;
    const where = { deletedAt: null, ...(query.roleId ? { roleId: query.roleId } : {}), ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.adminUser.findMany({ where, ...paginationSkipTake(page, perPage), select: {
        id: true, email: true, name: true, status: true, roleId: true, role: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
      }, orderBy: { createdAt: 'desc' } }),
      this.prisma.adminUser.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  private async find(id: number) {
    const user = await this.prisma.adminUser.findFirst({ where: { id, deletedAt: null }, select: {
      id: true, email: true, name: true, status: true, roleId: true, role: true,
      lastLoginAt: true, createdAt: true, updatedAt: true,
    } });
    if (!user) throw new NotFoundException('Admin user not found');
    return user;
  }

  private async assertEmail(email: string) {
    const existing = await this.prisma.adminUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null } });
    if (existing) throw new ConflictException(`Admin email "${email}" is already in use`);
  }

  async create(dto: CreateAdminUserDto) {
    const email = dto.email.trim().toLowerCase();
    await this.assertEmail(email);
    const passwordHash = await bcrypt.hash(dto.temporaryPassword, 10);
    try {
      const created = await this.prisma.adminUser.create({ data: { email, name: dto.name, roleId: dto.roleId, passwordHash } });
      return this.find(created.id);
    } catch (error) { return this.mapRoleError(error); }
  }

  async update(id: number, dto: UpdateAdminUserDto) {
    await this.find(id);
    try {
      await this.prisma.adminUser.update({ where: { id }, data: dto });
      return this.find(id);
    } catch (error) { return this.mapRoleError(error); }
  }

  async remove(id: number, currentAdminId: number) {
    if (id === currentAdminId) throw new BadRequestException('You cannot delete your own admin account');
    await this.find(id);
    await this.prisma.$transaction([
      this.prisma.adminUser.update({ where: { id }, data: { status: 'DISABLED', deletedAt: new Date() } }),
      this.prisma.adminRefreshToken.updateMany({ where: { adminUserId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  private mapRoleError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new BadRequestException('Role not found');
    throw error;
  }
}
