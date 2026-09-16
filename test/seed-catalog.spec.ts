import { catalog, seedProducts, validateProductBlueprints } from '../prisma/seed-products';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Small in-memory Prisma substitute: tests seed decisions without a configured database.
function database() {
  const tables: Record<string, Record<string, any>[]> = {};
  const db: Record<string, any> = {};
  for (const name of ['category', 'brand', 'productCondition', 'taxRate', 'productAttribute', 'productAttributeValue', 'shippingMethod', 'product', 'productVariant', 'productPriceTier', 'media', 'productFaq', 'productShippingMethod', 'productRelated']) {
    const rows: Record<string, any>[] = [];
    tables[name] = rows;
    const matches = (row: Record<string, any>, where: Record<string, any>): boolean => Object.entries(where).every(([key, value]) => value !== null && typeof value === 'object' ? matches(row, value) : value === null ? row[key] == null : row[key] === value);
    const create = ({ data }: { data: Record<string, any> }) => { const row = { id: rows.length + 1, ...data }; rows.push(row); return row; };
    db[name] = {
      findFirst: async ({ where }: { where: Record<string, any> }) => rows.find((row) => matches(row, where)) ?? null,
      findMany: async () => rows,
      create: async (args: { data: Record<string, any> }) => create(args),
      createMany: async ({ data }: { data: Record<string, any>[] }) => data.forEach((item) => create({ data: item })),
      upsert: async ({ where, create: data }: { where: Record<string, any>; create: Record<string, any> }) => rows.find((row) => matches(row, where)) ?? create({ data }),
    };
  }
  db.$transaction = jest.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(db));
  return { client: db as unknown as PrismaClient, tables, transaction: db.$transaction };
}

describe('Buildivo catalog seed', () => {
  let directory: string;
  const originalUploadDirectory = process.env.MEDIA_UPLOAD_DIR;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'buildivo-seed-')); process.env.MEDIA_UPLOAD_DIR = directory; });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    if (originalUploadDirectory === undefined) delete process.env.MEDIA_UPLOAD_DIR;
    else process.env.MEDIA_UPLOAD_DIR = originalUploadDirectory;
  });

  it('validates all source identifiers, references, local assets and prices', () => {
    expect(validateProductBlueprints()).toEqual({ categories: 15, brands: 10, attributes: 35, products: 18, variants: 20, standardProducts: 17, variableProducts: 1 });
    const invalid = JSON.parse(JSON.stringify(catalog));
    invalid.products[0].brandSlug = 'missing';
    expect(() => validateProductBlueprints(invalid)).toThrow('Invalid catalog reference');
    invalid.products[0] = { ...catalog.products[0], variants: [{ ...catalog.products[0].variants[0], salePrice: 99999 }] };
    expect(() => validateProductBlueprints(invalid)).toThrow('Invalid sale price');
  });

  it('creates linked records and preserves staff changes on a repeat run', async () => {
    const { client, tables } = database();
    const result = await seedProducts(client);
    expect(result.created).toBe(18);
    expect(tables.category).toHaveLength(15);
    expect(tables.brand).toHaveLength(10);
    expect(tables.productAttribute).toHaveLength(35);
    expect(tables.productVariant).toHaveLength(20);
    const variants = tables.productVariant.filter((v) => v.productId === tables.product[0].id);
    expect(variants.filter((v) => v.isDefault)).toHaveLength(1);
    expect(variants.map((v) => [v.price, v.salePrice, v.stockQty])).toEqual([[289, 249, 34], [159, undefined, 0], [199, undefined, 0]]);
    expect(tables.productPriceTier.map((t) => t.unitPrice)).toEqual([236.56, 224.1]);
    expect(tables.productRelated.length).toBeGreaterThan(0);
    for (const variant of tables.productVariant) {
      for (const attr of variant.attributes.create) {
        expect(tables.productAttributeValue.find((v) => v.id === attr.attributeValueId)?.attributeId).toBe(attr.attributeId);
      }
    }
    expect(readdirSync(directory).length).toBeGreaterThan(0);
    expect(tables.media.every((m) => readdirSync(directory).includes(m.url.split('/').pop()))).toBe(true);
    tables.product[0].title = 'Edited title';
    tables.productVariant[0].stockQty = 2;
    tables.productVariant[0].price = 310;
    const before = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
    expect((await seedProducts(client)).skipped).toBe(18);
    expect(Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]))).toEqual(before);
    expect(tables.product[0].title).toBe('Edited title');
    expect(tables.productVariant[0].stockQty).toBe(2);
    expect(tables.productVariant[0].price).toBe(310);
  });

  it('rejects legacy computer storage before writing catalog records or assets', async () => {
    const { client, tables, transaction } = database();
    tables.category.push({ id: 1, slug: 'storage', parentId: 42 });
    await expect(seedProducts(client)).rejects.toThrow('Legacy computer Storage');
    expect(transaction).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([]);
  });

  it('does not recreate an archived product', async () => {
    const { client, tables } = database();
    tables.product.push({ id: 1, slug: catalog.products[0].slug, deletedAt: new Date() });
    expect((await seedProducts(client)).created).toBe(17);
    expect(tables.productVariant.some((v) => v.productId === 1)).toBe(false);
  });
});
