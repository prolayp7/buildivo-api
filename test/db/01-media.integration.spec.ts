import { PrismaService } from '../../src/prisma/prisma.service';

describe('Media', () => {
  const prisma = new PrismaService();
  const createdIds: number[] = [];

  afterAll(async () => {
    await prisma.media.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it('stores a polymorphic media row and reads it back by owner', async () => {
    const media = await prisma.media.create({
      data: {
        ownerType: 'PRODUCT',
        ownerId: 999999,
        collection: 'main_image',
        url: 'https://cdn.example.com/products/999999/main.jpg',
        altText: 'Test product image',
        sortOrder: 0,
      },
    });
    createdIds.push(media.id);

    expect(media.uuid).toBeDefined();

    const found = await prisma.media.findMany({
      where: { ownerType: 'PRODUCT', ownerId: 999999, collection: 'main_image' },
    });
    expect(found).toHaveLength(1);
    expect(found[0].url).toBe('https://cdn.example.com/products/999999/main.jpg');
  });
});
