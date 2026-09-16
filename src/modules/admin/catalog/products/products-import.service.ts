import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';

export interface UploadedImportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface ImportError {
  row: number;
  slug?: string;
  message: string;
}

export interface ProductsImportResult {
  created: number;
  updated: number;
  errors: ImportError[];
}

@Injectable()
export class ProductsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async import(file?: UploadedImportFile): Promise<ProductsImportResult> {
    if (!file) throw new BadRequestException('Import file is required');
    const extension = file.originalname.toLowerCase().split('.').pop();
    if (!['json', 'csv'].includes(extension ?? '')) {
      throw new BadRequestException('Only .json and .csv product imports are supported');
    }
    const rawRows = extension === 'json'
      ? this.parseJson(file.buffer)
      : this.parseCsv(file.buffer.toString('utf8'));
    if (rawRows.length > 5000) throw new BadRequestException('Import cannot exceed 5000 products');

    let created = 0;
    let updated = 0;
    const errors: ImportError[] = [];
    for (let index = 0; index < rawRows.length; index++) {
      const rowNumber = index + (extension === 'csv' ? 2 : 1);
      try {
        const dto = await this.toDto(rawRows[index]);
        const existing = await this.prisma.product.findFirst({
          where: { slug: dto.slug, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
          await this.products.update(existing.id, dto);
          updated++;
        } else {
          await this.products.create(dto);
          created++;
        }
      } catch (error) {
        const slug = this.stringValue(rawRows[index], 'slug');
        errors.push({ row: rowNumber, ...(slug ? { slug } : {}), message: this.message(error) });
      }
    }
    return { created, updated, errors };
  }

  private parseJson(buffer: Buffer): Record<string, unknown>[] {
    let parsed: unknown;
    try { parsed = JSON.parse(buffer.toString('utf8')); }
    catch { throw new BadRequestException('Import file contains invalid JSON'); }
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { products?: unknown }).products)
        ? (parsed as { products: unknown[] }).products
        : null;
    if (!rows) throw new BadRequestException('JSON import must be an array or an object with a products array');
    if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      throw new BadRequestException('Every imported product must be an object');
    }
    return rows as Record<string, unknown>[];
  }

  private parseCsv(input: string): Record<string, unknown>[] {
    const records = this.csvRecords(input.replace(/^\uFEFF/, ''));
    if (records.length < 2) throw new BadRequestException('CSV import requires a header and at least one product row');
    const headers = records[0].map((header) => header.trim());
    if (!headers.includes('slug') || !headers.includes('title') || !headers.includes('categoryId')) {
      throw new BadRequestException('CSV headers must include categoryId, title, and slug');
    }
    return records.slice(1).filter((record) => record.some((value) => value.trim())).map((record) =>
      Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])),
    );
  }

  private csvRecords(input: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field.length === 0) quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += char;
    }
    if (quoted) throw new BadRequestException('CSV contains an unterminated quoted field');
    if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    return rows;
  }

  private async toDto(raw: Record<string, unknown>): Promise<CreateProductDto> {
    const normalized = { ...raw };
    const integers = ['categoryId', 'brandId', 'productConditionId', 'taxRateId', 'warrantyMonths', 'returnableDays'];
    const booleans = ['isReturnable', 'isFeatured', 'isTopProduct', 'isIndexable'];
    for (const key of integers) normalized[key] = this.optionalNumber(normalized[key]);
    for (const key of booleans) normalized[key] = this.optionalBoolean(normalized[key]);
    if (typeof normalized.secondaryCategoryIds === 'string') {
      normalized.secondaryCategoryIds = normalized.secondaryCategoryIds
        ? normalized.secondaryCategoryIds.split('|').map((value) => Number(value.trim()))
        : undefined;
    }
    if (typeof normalized.specsSummary === 'string') {
      normalized.specsSummary = normalized.specsSummary ? JSON.parse(normalized.specsSummary) : undefined;
    }
    for (const [key, value] of Object.entries(normalized)) if (value === '') delete normalized[key];
    const dto = plainToInstance(CreateProductDto, normalized);
    const violations = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (violations.length) {
      const messages = violations.flatMap((violation) => Object.values(violation.constraints ?? {}));
      throw new BadRequestException(messages.join('; '));
    }
    return dto;
  }

  private optionalNumber(value: unknown): unknown {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }

  private optionalBoolean(value: unknown): unknown {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  }

  private stringValue(row: Record<string, unknown>, key: string): string | undefined {
    return typeof row[key] === 'string' ? row[key] as string : undefined;
  }

  private message(error: unknown): string {
    if (error instanceof Error) {
      const response = (error as { getResponse?: () => unknown }).getResponse?.();
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message: unknown }).message;
        return Array.isArray(message) ? message.join('; ') : String(message);
      }
      return error.message;
    }
    return 'Unknown import error';
  }
}
