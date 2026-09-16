import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

const roleInclude = { permissions: { include: { permission: true }, orderBy: { permission: { key: 'asc' as const } } }, _count: { select: { adminUsers: true } } };

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list() { return this.prisma.role.findMany({ include: roleInclude, orderBy: { name: 'asc' } }); }
  permissions() { return this.prisma.permission.findMany({ orderBy: { key: 'asc' } }); }

  private async permissionIds(tx: Prisma.TransactionClient, keys: string[]) {
    const permissions = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
    if (permissions.length !== keys.length) {
      const found = new Set(permissions.map((item) => item.key));
      throw new BadRequestException(`Unknown permission keys: ${keys.filter((key) => !found.has(key)).join(', ')}`);
    }
    return permissions.map((item) => item.id);
  }

  async create(dto: CreateRoleDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const permissionIds = await this.permissionIds(tx, dto.permissionKeys);
        return tx.role.create({ data: {
          name: dto.name, description: dto.description,
          permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        }, include: roleInclude });
      });
    } catch (error) { return this.mapNameError(error, dto.name); }
  }

  async update(id: number, dto: UpdateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Role not found');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const permissionIds = dto.permissionKeys !== undefined ? await this.permissionIds(tx, dto.permissionKeys) : undefined;
        return tx.role.update({ where: { id }, data: {
          name: dto.name, description: dto.description,
          ...(permissionIds ? { permissions: { deleteMany: {}, create: permissionIds.map((permissionId) => ({ permissionId })) } } : {}),
        }, include: roleInclude });
      });
    } catch (error) { return this.mapNameError(error, dto.name ?? existing.name); }
  }

  async remove(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { adminUsers: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (role._count.adminUsers) throw new ConflictException('Role is assigned to one or more admin users');
    await this.prisma.role.delete({ where: { id } });
  }

  private mapNameError(error: unknown, name: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(`Role name "${name}" is already in use`);
    throw error;
  }
}
