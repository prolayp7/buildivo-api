import { PrismaService } from '../../src/prisma/prisma.service';

describe('Content / CMS', () => {
  const prisma = new PrismaService();
  let blogCategoryId: number;
  let authorId: number;
  let blogPostId: number;
  let pageId: number;
  let faqCategoryId: number;
  let faqId: number;
  let testimonialId: number;
  let enquiryId: number;

  afterAll(async () => {
    if (blogPostId) await prisma.blogPost.delete({ where: { id: blogPostId } });
    if (authorId) await prisma.author.delete({ where: { id: authorId } });
    if (blogCategoryId) await prisma.blogCategory.delete({ where: { id: blogCategoryId } });
    if (pageId) await prisma.page.delete({ where: { id: pageId } });
    if (faqId) await prisma.faq.delete({ where: { id: faqId } });
    if (faqCategoryId) await prisma.faqCategory.delete({ where: { id: faqCategoryId } });
    if (testimonialId) await prisma.testimonial.delete({ where: { id: testimonialId } });
    if (enquiryId) await prisma.enquiry.delete({ where: { id: enquiryId } });
    await prisma.$disconnect();
  });

  it('creates a blog post with category and author, a page, an FAQ, a testimonial, and an enquiry', async () => {
    const blogCategory = await prisma.blogCategory.create({ data: { title: 'Test Buying Guides', slug: 'test-buying-guides' } });
    blogCategoryId = blogCategory.id;

    const author = await prisma.author.create({ data: { name: 'Test Author' } });
    authorId = author.id;

    const blogPost = await prisma.blogPost.create({
      data: {
        blogCategoryId,
        authorId,
        title: 'Test How to Build a Gaming PC',
        slug: 'test-how-to-build-a-gaming-pc',
        content: 'Step one...',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
      include: { blogCategory: true, author: true },
    });
    blogPostId = blogPost.id;
    expect(blogPost.blogCategory?.title).toBe('Test Buying Guides');
    expect(blogPost.author?.name).toBe('Test Author');

    const page = await prisma.page.create({ data: { slug: 'test-shipping-info', title: 'Test Shipping Info', status: 'PUBLISHED' } });
    pageId = page.id;

    const faqCategory = await prisma.faqCategory.create({ data: { name: 'Test Shipping' } });
    faqCategoryId = faqCategory.id;
    const faq = await prisma.faq.create({
      data: { faqCategoryId, question: 'Do you ship to Northern Ireland?', answer: 'Yes.' },
    });
    faqId = faq.id;

    const testimonial = await prisma.testimonial.create({
      data: { name: 'Test Customer', quote: 'Great service', stars: 5 },
    });
    testimonialId = testimonial.id;

    const enquiry = await prisma.enquiry.create({
      data: { type: 'contact', name: 'Test Enquirer', message: 'Do you have this in stock?' },
    });
    enquiryId = enquiry.id;
    expect(enquiry.status).toBe('NEW');
  });

  it('rejects a duplicate page slug (unique constraint)', async () => {
    await expect(
      prisma.page.create({ data: { slug: 'test-shipping-info', title: 'Duplicate' } }),
    ).rejects.toThrow();
  });
});
