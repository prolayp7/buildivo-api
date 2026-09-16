import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'; import { PrismaService } from '../../../prisma/prisma.service'; import { CreateHeroSlideDto } from './dto/create-hero-slide.dto'; import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto'; import { CreateTrustBadgeDto } from './dto/create-trust-badge.dto';
@Injectable()
export class HeroService {
  constructor(private readonly prisma: PrismaService) {}
  slides() { return this.prisma.heroSlide.findMany({ orderBy: { sortOrder: 'asc' } }); }
  private validate(startsAt?: string | Date | null, endsAt?: string | Date | null) { if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) throw new BadRequestException('startsAt must be before endsAt'); }
  createSlide(dto: CreateHeroSlideDto) { this.validate(dto.startsAt, dto.endsAt); return this.prisma.heroSlide.create({ data: { ...dto, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } }); }
  async updateSlide(id: number, dto: UpdateHeroSlideDto) { const current = await this.prisma.heroSlide.findUnique({ where: { id } }); if (!current) throw new NotFoundException('Hero slide not found'); this.validate(dto.startsAt ?? current.startsAt, dto.endsAt ?? current.endsAt); return this.prisma.heroSlide.update({ where: { id }, data: { ...dto, startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined, endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined } }); }
  async removeSlide(id: number) { const result = await this.prisma.heroSlide.deleteMany({ where: { id } }); if (!result.count) throw new NotFoundException('Hero slide not found'); }
  badges() { return this.prisma.heroTrustBadge.findMany({ orderBy: { sortOrder: 'asc' } }); }
  createBadge(dto: CreateTrustBadgeDto) { return this.prisma.heroTrustBadge.create({ data: dto }); }
}
