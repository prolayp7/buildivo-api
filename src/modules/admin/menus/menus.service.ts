import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'; import { Prisma } from '@prisma/client'; import { PrismaService } from '../../../prisma/prisma.service'; import { CreateMenuDto } from './dto/create-menu.dto'; import { CreateMenuItemDto } from './dto/create-menu-item.dto'; import { UpdateMenuItemDto } from './dto/update-menu-item.dto'; import { UpsertMegaMenuPanelDto } from './dto/upsert-mega-menu-panel.dto';
const panelInclude = { columns: { include: { links: { include: { category: true }, orderBy: { sortOrder: 'asc' as const } } }, orderBy: { sortOrder: 'asc' as const } } };
const itemInclude = { category: true, megaMenuPanel: { include: panelInclude } };
@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.menu.findMany({ include: { items: { include: itemInclude, orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }] } }, orderBy: [{ location: 'asc' }, { name: 'asc' }] }); }
  async create(dto: CreateMenuDto) { try { return await this.prisma.menu.create({ data: dto, include: { items: true } }); } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Menu slug "${dto.slug}" is already in use`); throw e; } }
  private async menu(id: number) { const menu = await this.prisma.menu.findUnique({ where: { id } }); if (!menu) throw new NotFoundException('Menu not found'); return menu; }
  private async parent(menuId: number, parentId?: number, itemId?: number) {
    let cursor = parentId;
    while (cursor) {
      if (cursor === itemId) throw new BadRequestException('Menu item hierarchy cannot contain a cycle');
      const parent = await this.prisma.menuItem.findFirst({ where: { id: cursor, menuId }, select: { parentId: true } });
      if (!parent) throw new BadRequestException('Parent menu item does not belong to this menu');
      cursor = parent.parentId ?? undefined;
    }
  }
  async addItem(menuId: number, dto: CreateMenuItemDto) { await this.menu(menuId); await this.parent(menuId, dto.parentId); try { return await this.prisma.menuItem.create({ data: { ...dto, menuId }, include: itemInclude }); } catch (e) { return this.mapCategory(e); } }
  private async item(menuId: number, itemId: number) { const item = await this.prisma.menuItem.findFirst({ where: { id: itemId, menuId } }); if (!item) throw new NotFoundException('Menu item not found'); return item; }
  async updateItem(menuId: number, itemId: number, dto: UpdateMenuItemDto) { await this.item(menuId, itemId); await this.parent(menuId, dto.parentId, itemId); try { return await this.prisma.menuItem.update({ where: { id: itemId }, data: dto, include: itemInclude }); } catch (e) { return this.mapCategory(e); } }
  async removeItem(menuId: number, itemId: number) { await this.item(menuId, itemId); await this.prisma.menuItem.delete({ where: { id: itemId } }); }
  async upsertPanel(itemId: number, dto: UpsertMegaMenuPanelDto) {
    const item = await this.prisma.menuItem.findUnique({ where: { id: itemId } }); if (!item) throw new NotFoundException('Menu item not found');
    for (const column of dto.columns) for (const link of column.links) if (!link.categoryId && !link.href) throw new BadRequestException('Each mega-menu link requires categoryId or href');
    try { return await this.prisma.$transaction(async tx => {
      const existing = await tx.megaMenuPanel.findUnique({ where: { menuItemId: itemId } });
      if (existing) await tx.megaMenuColumn.deleteMany({ where: { panelId: existing.id } });
      const nested = dto.columns.map((column, index) => ({ title: column.title, sortOrder: column.sortOrder ?? index, links: { create: column.links.map((link, linkIndex) => ({ ...link, sortOrder: link.sortOrder ?? linkIndex })) } }));
      return tx.megaMenuPanel.upsert({ where: { menuItemId: itemId }, create: { menuItemId: itemId, columns: { create: nested } }, update: { columns: { create: nested } }, include: panelInclude });
    }); } catch (e) { return this.mapCategory(e); }
  }
  private mapCategory(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new BadRequestException('Category not found'); throw error; }
}
