import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { seedProducts } from './seed-products';

const prisma = new PrismaClient();

async function main() {
  // Roles & permissions
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: { name: 'Super Admin', description: 'Full access to every admin capability' },
  });

  const permissionKeys = [
    'products.manage',
    'orders.manage',
    'orders.refund',
    'content.manage',
    'settings.manage',
    'reports.view',
    'customers.manage',
    'media.manage',
    'shipping.manage',
    'admins.manage',
    'marketing.manage',
    'reviews.moderate',
    'gift_cards.manage',
    'notifications.manage',
    'quotes.manage',
  ];
  for (const key of permissionKeys) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: permission.id },
    });
  }

  // Super Admin user
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL ?? 'superadmin@ukshop.test';
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const existingSuperAdmin = await prisma.adminUser.findFirst({
    where: { email: seedAdminEmail, deletedAt: null },
  });
  if (!existingSuperAdmin) {
    const passwordHash = await bcrypt.hash(seedAdminPassword, 10);
    await prisma.adminUser.create({
      data: {
        email: seedAdminEmail,
        passwordHash,
        name: 'Super Admin',
        roleId: superAdminRole.id,
      },
    });
  }

  // Product conditions
  const conditionTitles = ['New', 'Refurbished', 'Open Box', 'Used'];
  for (const title of conditionTitles) {
    await prisma.productCondition.upsert({
      where: { slug: title.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: { title, slug: title.toLowerCase().replace(/\s+/g, '-') },
    });
  }

  // Tax rates
  const standardVat = await prisma.taxRate.upsert({
    where: { title: 'Standard' },
    update: {},
    create: { title: 'Standard', ratePercent: 20.0, isDefault: true },
  });
  await prisma.taxRate.upsert({
    where: { title: 'Reduced' },
    update: {},
    create: { title: 'Reduced', ratePercent: 5.0 },
  });
  await prisma.taxRate.upsert({
    where: { title: 'Zero-rated' },
    update: {},
    create: { title: 'Zero-rated', ratePercent: 0.0 },
  });

  // Shipping methods
  const royalMailExisting = await prisma.shippingMethod.findFirst({ where: { title: 'Royal Mail Tracked 48' } });
  if (!royalMailExisting) {
    await prisma.shippingMethod.create({
      data: {
        title: 'Royal Mail Tracked 48',
        carrier: 'Royal Mail',
        rateType: 'FLAT',
        flatRate: 4.99,
        freeOverAmount: 75,
        estimatedDaysMin: 2,
        estimatedDaysMax: 3,
      },
    });
  }
  const dhlExisting = await prisma.shippingMethod.findFirst({ where: { title: 'DHL Next Day' } });
  if (!dhlExisting) {
    await prisma.shippingMethod.create({
      data: {
        title: 'DHL Next Day',
        carrier: 'DHL',
        rateType: 'FLAT',
        flatRate: 9.99,
        estimatedDaysMin: 1,
        estimatedDaysMax: 1,
      },
    });
  }

  // Category tree (subset from requirement.md)
  // Note: Category.slug is no longer a Prisma `@unique` field (it's enforced via a
  // partial unique index scoped to live rows instead, so soft-deleted slugs can be
  // reused - see the schema_review_fixes migration), so it can't be used in an
  // `upsert`/`findUnique` where-clause. Fall back to findFirst + conditional create.
  const findOrCreateCategory = (where: { slug: string }, create: Parameters<typeof prisma.category.create>[0]['data']) =>
    prisma.category.findFirst({ where: { ...where, deletedAt: null } }).then((existing) =>
      existing ?? prisma.category.create({ data: create }),
    );

  const pcComponents = await findOrCreateCategory(
    { slug: 'pc-components' },
    { title: 'PC Components', slug: 'pc-components', sortOrder: 1 },
  );
  await findOrCreateCategory(
    { slug: 'cpus-processors' },
    { title: 'CPUs / Processors', slug: 'cpus-processors', parentId: pcComponents.id, sortOrder: 1 },
  );
  await findOrCreateCategory(
    { slug: 'graphics-cards' },
    { title: 'Graphics Cards', slug: 'graphics-cards', parentId: pcComponents.id, sortOrder: 2 },
  );
  await findOrCreateCategory(
    { slug: 'motherboards' },
    { title: 'Motherboards', slug: 'motherboards', parentId: pcComponents.id, sortOrder: 3 },
  );
  await findOrCreateCategory(
    { slug: 'memory-ram' },
    { title: 'Memory / RAM', slug: 'memory-ram', parentId: pcComponents.id, sortOrder: 4 },
  );
  await findOrCreateCategory(
    { slug: 'storage' },
    { title: 'Storage', slug: 'storage', parentId: pcComponents.id, sortOrder: 5 },
  );
  await findOrCreateCategory(
    { slug: 'pc-cases' },
    { title: 'PC Cases', slug: 'pc-cases', parentId: pcComponents.id, sortOrder: 6 },
  );
  await findOrCreateCategory(
    { slug: 'power-supplies' },
    { title: 'Power Supplies', slug: 'power-supplies', parentId: pcComponents.id, sortOrder: 7 },
  );
  await findOrCreateCategory(
    { slug: 'cooling' },
    { title: 'Cooling', slug: 'cooling', parentId: pcComponents.id, sortOrder: 8 },
  );

  const computers = await findOrCreateCategory(
    { slug: 'computers' },
    { title: 'Computers', slug: 'computers', sortOrder: 2 },
  );
  await findOrCreateCategory(
    { slug: 'gaming-pcs' },
    { title: 'Gaming PCs', slug: 'gaming-pcs', parentId: computers.id, sortOrder: 1 },
  );
  await findOrCreateCategory(
    { slug: 'desktop-pcs' },
    { title: 'Desktop PCs', slug: 'desktop-pcs', parentId: computers.id, sortOrder: 2 },
  );
  await findOrCreateCategory(
    { slug: 'workstations' },
    { title: 'Workstations', slug: 'workstations', parentId: computers.id, sortOrder: 3 },
  );
  await findOrCreateCategory(
    { slug: 'mini-pcs' },
    { title: 'Mini PCs', slug: 'mini-pcs', parentId: computers.id, sortOrder: 4 },
  );

  const laptops = await findOrCreateCategory(
    { slug: 'laptops' },
    { title: 'Laptops', slug: 'laptops', sortOrder: 3 },
  );
  await findOrCreateCategory(
    { slug: 'gaming-laptops' },
    { title: 'Gaming Laptops', slug: 'gaming-laptops', parentId: laptops.id, sortOrder: 1 },
  );
  await findOrCreateCategory(
    { slug: 'business-laptops' },
    { title: 'Business Laptops', slug: 'business-laptops', parentId: laptops.id, sortOrder: 2 },
  );
  await findOrCreateCategory(
    { slug: 'ultrabooks' },
    { title: 'Ultrabooks', slug: 'ultrabooks', parentId: laptops.id, sortOrder: 3 },
  );

  const peripherals = await findOrCreateCategory(
    { slug: 'peripherals' },
    { title: 'Peripherals', slug: 'peripherals', sortOrder: 4 },
  );
  await findOrCreateCategory(
    { slug: 'monitors' },
    { title: 'Monitors', slug: 'monitors', parentId: peripherals.id, sortOrder: 1 },
  );
  await findOrCreateCategory(
    { slug: 'keyboards' },
    { title: 'Keyboards', slug: 'keyboards', parentId: peripherals.id, sortOrder: 2 },
  );
  await findOrCreateCategory(
    { slug: 'mice' },
    { title: 'Mice', slug: 'mice', parentId: peripherals.id, sortOrder: 3 },
  );
  await findOrCreateCategory(
    { slug: 'headsets' },
    { title: 'Headsets', slug: 'headsets', parentId: peripherals.id, sortOrder: 4 },
  );
  await findOrCreateCategory(
    { slug: 'webcams' },
    { title: 'Webcams', slug: 'webcams', parentId: peripherals.id, sortOrder: 5 },
  );

  const networking = await findOrCreateCategory(
    { slug: 'networking' },
    { title: 'Networking', slug: 'networking', sortOrder: 5 },
  );
  for (const [title, slug, sortOrder] of [
    ['Routers', 'routers', 1],
    ['Network Switches', 'network-switches', 2],
    ['Wireless Adapters', 'wireless-adapters', 3],
  ] as const) {
    await findOrCreateCategory({ slug }, { title, slug, parentId: networking.id, sortOrder });
  }

  const software = await findOrCreateCategory(
    { slug: 'software' },
    { title: 'Software', slug: 'software', sortOrder: 6 },
  );
  await findOrCreateCategory(
    { slug: 'operating-systems' },
    { title: 'Operating Systems', slug: 'operating-systems', parentId: software.id, sortOrder: 1 },
  );
  await findOrCreateCategory(
    { slug: 'security-software' },
    { title: 'Security Software', slug: 'security-software', parentId: software.id, sortOrder: 2 },
  );

  // Brands
  for (const title of [
    'AMD',
    'NVIDIA',
    'Intel',
    'ASUS',
    'Acer',
    'Apple',
    'Corsair',
    'Crucial',
    'Dell',
    'Gigabyte',
    'HP',
    'Kingston',
    'Lenovo',
    'Logitech',
    'MSI',
    'NZXT',
    'Razer',
    'Samsung',
    'Seagate',
    'Western Digital',
  ]) {
    await prisma.brand.upsert({
      where: { slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') },
      update: { title, status: 'ACTIVE' },
      create: { title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') },
    });
  }

  // Suppliers
  const suppliers = [
    { title: 'TD SYNNEX UK', slug: 'td-synnex-uk', description: 'UK technology distributor for hardware, software, and cloud products.' },
    { title: 'Ingram Micro UK', slug: 'ingram-micro-uk', description: 'Technology product and supply-chain distributor.' },
    { title: 'Exertis UK', slug: 'exertis-uk', description: 'UK distributor for computing, components, and consumer technology.' },
    { title: 'CMS Distribution', slug: 'cms-distribution', description: 'Specialist distributor for business and consumer technologies.' },
    { title: 'Westcoast', slug: 'westcoast', description: 'UK distributor for computing hardware, software, and services.' },
  ];
  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { slug: supplier.slug },
      update: { title: supplier.title, description: supplier.description, status: 'ACTIVE' },
      create: supplier,
    });
  }

  /* // Demo product + variant (superseded by the complete 620-product catalogue seed)
  // Product.slug and ProductVariant.slug are likewise no longer `@unique` (same partial-index
  // reasoning as Category.slug above), so use findFirst-or-create here too.
  const graphicsCards = await prisma.category.findFirstOrThrow({ where: { slug: 'graphics-cards' } });
  const nvidia = await prisma.brand.findUniqueOrThrow({ where: { slug: 'nvidia' } });
  const newCondition = await prisma.productCondition.findUniqueOrThrow({ where: { slug: 'new' } });
  const demoProduct = await prisma.product.findFirst({ where: { slug: 'nvidia-geforce-rtx-4070' } }).then(
    (existing) =>
      existing ??
      prisma.product.create({
        data: {
          categoryId: graphicsCards.id,
          brandId: nvidia.id,
          productConditionId: newCondition.id,
          taxRateId: standardVat.id,
          title: 'NVIDIA GeForce RTX 4070',
          slug: 'nvidia-geforce-rtx-4070',
          shortDescription: '12GB GDDR6X graphics card',
          status: 'ACTIVE',
        },
      }),
  );
  const demoVariantExisting = await prisma.productVariant.findFirst({ where: { slug: 'nvidia-geforce-rtx-4070-12gb' } });
  if (!demoVariantExisting) {
    await prisma.productVariant.create({
      data: {
        productId: demoProduct.id,
        title: '12GB',
        slug: 'nvidia-geforce-rtx-4070-12gb',
        price: 549.99,
        stockQty: 25,
        isDefault: true,
      },
    });
  }
  */

  const productSeedResult = await seedProducts(prisma);
  console.log(
    `Product catalogue: ${productSeedResult.products} products across ${productSeedResult.categories} categories ` +
      `(${productSeedResult.created} created, ${productSeedResult.updated} updated).`,
  );

  // Settings
  await prisma.setting.upsert({
    where: { key: 'default_vat_rate_percent' },
    update: {},
    create: { key: 'default_vat_rate_percent', value: 20 },
  });
  await prisma.setting.upsert({
    where: { key: 'allowed_shipping_countries' },
    update: {},
    create: { key: 'allowed_shipping_countries', value: ['GB'] },
  });

  // Header menu
  const headerMenu = await prisma.menu.upsert({
    where: { slug: 'header' },
    update: {},
    create: { name: 'Header', slug: 'header', location: 'HEADER' },
  });
  const existingComponentsItem = await prisma.menuItem.findFirst({
    where: { menuId: headerMenu.id, label: 'PC Components' },
  });
  if (!existingComponentsItem) {
    await prisma.menuItem.create({
      data: { menuId: headerMenu.id, label: 'PC Components', categoryId: pcComponents.id, sortOrder: 1 },
    });
  }

  // Homepage merchandising - demo content so the storefront home page has
  // something real to render (Day 6 will replace this with production content
  // entered through the admin panel).
  //
  // Hero slides were extended with eyebrow/image/tone/secondary CTA fields
  // and Hero.tsx switched from a hardcoded SLIDES array to reading these
  // live - reseed with content matching that hardcoded array exactly (only
  // if still at the old 3-slide placeholder state) so the storefront looks
  // identical until an admin actually edits a slide.
  const oldPlaceholderSlide = await prisma.heroSlide.findFirst({ where: { headline: 'Deals now live' } });
  const heroSlideCount = await prisma.heroSlide.count();
  if (heroSlideCount === 0 || oldPlaceholderSlide) {
    if (oldPlaceholderSlide) await prisma.heroSlide.deleteMany({});
    await prisma.heroSlide.createMany({
      data: [
        { eyebrow: 'New generation graphics', headline: 'Radeon RX 9070 XT graphics, ready to perform', subheading: 'Explore high-performance graphics cards for smooth gaming, creative work and demanding everyday builds.', image: '/images/products/Sapphire Pulse RX 9070 XT Display.webp', imagePosition: '68% center', tone: 'VIOLET', ctaLabel: 'Shop graphics cards', ctaUrl: '/category?sub=Graphics%20Cards', secondaryCtaLabel: 'Compare components', secondaryCtaUrl: '/category?cat=PC%20Components', sortOrder: 1 },
        { eyebrow: 'Portable performance', headline: 'Gaming laptops built for the next challenge', subheading: 'Find fast displays, powerful mobile graphics and capable processors in one streamlined setup.', image: '/images/products/ASUS ROG Zephyrus G16 Gaming Setup.webp', imagePosition: '64% center', tone: 'ELECTRIC', ctaLabel: 'Shop gaming laptops', ctaUrl: '/category?sub=Gaming%20Laptops', secondaryCtaLabel: 'Browse all laptops', secondaryCtaUrl: '/category?cat=Laptops', sortOrder: 2 },
        { eyebrow: 'Build it your way', headline: 'Airflow-focused cases for cleaner PC builds', subheading: 'Start your next system with modern layouts, considered cooling and space for the components that matter.', image: '/images/products/NZXT H5 Flow RGB Showcase.webp', imagePosition: '72% center', tone: 'CYAN', ctaLabel: 'Shop PC cases', ctaUrl: '/category?sub=Cases', secondaryCtaLabel: 'Explore components', secondaryCtaUrl: '/category?cat=PC%20Components', sortOrder: 3 },
        { eyebrow: 'Work from anywhere', headline: 'Business laptops with everyday staying power', subheading: 'Discover dependable, travel-ready machines designed for focused work at the office, at home or on the move.', image: '/images/products/ThinkPad X1 Carbon Aura Edition Showcase.webp', imagePosition: '68% center', tone: 'CRIMSON', ctaLabel: 'Shop business laptops', ctaUrl: '/category?sub=Business%20Laptops', secondaryCtaLabel: 'View all laptops', secondaryCtaUrl: '/category?cat=Laptops', sortOrder: 4 },
      ],
    });
  }
  const heroBadgeCount = await prisma.heroTrustBadge.count();
  if (heroBadgeCount === 0) {
    await prisma.heroTrustBadge.createMany({
      data: [
        { label: 'Free UK next-day delivery', icon: 'i-truck', sortOrder: 1 },
        { label: '30-day returns', icon: 'i-shield', sortOrder: 2 },
        { label: '0% finance available', icon: 'i-card', sortOrder: 3 },
        { label: 'Manchester showroom', icon: 'i-wrench', sortOrder: 4 },
      ],
    });
  }

  const findOrCreateBanner = (slug: string, create: Parameters<typeof prisma.banner.create>[0]['data']) =>
    prisma.banner.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.banner.create({ data: create }));
  await findOrCreateBanner('home-pc-components', {
    title: 'PC Components', slug: 'home-pc-components', linkType: 'CATEGORY', categoryId: pcComponents.id, position: 'home-top', displayOrder: 1,
  });
  await findOrCreateBanner('home-laptops', {
    title: 'Laptops', slug: 'home-laptops', linkType: 'CATEGORY', categoryId: laptops.id, position: 'home-top', displayOrder: 2,
  });

  const findOrCreateFeaturedSection = (slug: string, create: Parameters<typeof prisma.featuredSection.create>[0]['data']) =>
    prisma.featuredSection.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.featuredSection.create({ data: create }));
  await findOrCreateFeaturedSection('new-arrivals', { title: 'New Arrivals', slug: 'new-arrivals', sectionType: 'NEWLY_ADDED', sortOrder: 1 });
  await findOrCreateFeaturedSection('best-sellers', { title: 'Best Sellers', slug: 'best-sellers', sectionType: 'BEST_SELLER', sortOrder: 2 });
  await findOrCreateFeaturedSection('top-rated', { title: 'Top Rated', slug: 'top-rated', sectionType: 'TOP_RATED', sortOrder: 3 });

  // Homepage section ordering/visibility - seeded to match the storefront's
  // existing default layout so nothing moves visually until an admin
  // reorders or hides something from the admin panel.
  const homepageSectionCount = await prisma.homepageSection.count();
  if (homepageSectionCount === 0) {
    await prisma.homepageSection.createMany({
      data: [
        { type: 'HERO', label: 'Hero carousel', sortOrder: 0, config: { cards: [
          { kicker: 'Save up to £220', heading: 'Weekend component deals', description: 'CPUs, memory kits and NVMe drives reduced until Sunday midnight.', ctaLabel: 'See all deals', href: '/category?deals=1', image: '/images/products/Vengeance DDR5 RGB Memory Modules.webp' },
          { kicker: 'Build service', heading: 'Custom PC configurator', description: 'Pick parts with compatibility checks and wattage estimates.', ctaLabel: 'Start a build', href: '/category?cat=Computers', image: '/images/products/NZXT H5 Flow RGB Showcase.webp' },
        ] } },
        { type: 'TRUST_STRIP', label: 'Trust strip', sortOrder: 1 },
        { type: 'DEALS', label: "Today's deals", sortOrder: 2 },
        { type: 'FEATURED_PRODUCTS', label: 'Best sellers', sortOrder: 3, config: { slug: 'best-sellers' } },
        { type: 'NEW_ARRIVALS', label: 'New arrivals', sortOrder: 4 },
        { type: 'BRANDS', label: 'Shop by brand', sortOrder: 5 },
        { type: 'BANNERS', label: 'Promotional banners', sortOrder: 6, config: { position: 'home-top' } },
        { type: 'TESTIMONIALS', label: 'Customer testimonials', sortOrder: 7 },
        { type: 'BLOG_HIGHLIGHTS', label: 'Latest from the blog', sortOrder: 8 },
        { type: 'FAQS', label: 'Frequently asked questions', sortOrder: 9 },
        { type: 'NEWSLETTER', label: 'Newsletter signup', sortOrder: 10, config: { heading: 'Get restock alerts & deal notifications', body: 'One email a week, mostly about stock drops and price cuts. No spam.' } },
      ],
    });
  }
  // Added in a follow-up batch, once these types existed - findFirst-or-
  // create per type (rather than another count()===0 guard) so this runs
  // safely against a DB that already has the first 11 rows seeded.
  const findOrCreateHomepageSection = (type: Parameters<typeof prisma.homepageSection.create>[0]['data']['type'], data: Omit<Parameters<typeof prisma.homepageSection.create>[0]['data'], 'type'>) =>
    prisma.homepageSection.findFirst({ where: { type } }).then((existing) => existing ?? prisma.homepageSection.create({ data: { type, ...data } }));
  await findOrCreateHomepageSection('CATEGORY_SHOWCASE', { label: 'Shop by category', sortOrder: 11 });
  await findOrCreateHomepageSection('SHOP_BY_NEED', { label: 'Shop by need', sortOrder: 12 });
  await findOrCreateHomepageSection('GAMING_SHOWCASE', { label: 'Level up your gaming', sortOrder: 13 });
  await findOrCreateHomepageSection('LAPTOP_SHOWCASE', { label: 'Laptops for work, study & play', sortOrder: 14 });
  await findOrCreateHomepageSection('BUYING_GUIDES', { label: 'Buying guides', sortOrder: 15 });
  await findOrCreateHomepageSection('SEO_INTRO', { label: 'SEO intro & special offer', sortOrder: 16 });

  // Blog & static CMS pages - demo content for the storefront's content pages.
  const blogCategory = await prisma.blogCategory.upsert({
    where: { slug: 'buying-guides' },
    update: {},
    create: { title: 'Buying Guides', slug: 'buying-guides' },
  });
  const author = await prisma.author.findFirst({ where: { name: 'UK Computer Shop Team' } }).then((existing) =>
    existing ?? prisma.author.create({ data: { name: 'UK Computer Shop Team', role: 'Editorial' } }),
  );
  const findOrCreateBlogPost = (slug: string, create: Parameters<typeof prisma.blogPost.create>[0]['data']) =>
    prisma.blogPost.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.blogPost.create({ data: create }));
  await findOrCreateBlogPost('choosing-your-first-graphics-card', {
    title: 'Choosing your first graphics card',
    slug: 'choosing-your-first-graphics-card',
    excerpt: 'A plain-English guide to VRAM, wattage and what actually matters for 1080p and 1440p gaming.',
    content:
      'Picking a graphics card can feel overwhelming with so many model numbers and marketing terms flying around. Start with your monitor: its resolution and refresh rate tell you roughly how much GPU power you need.\n\nFor 1080p at 60Hz, a mid-range card is plenty. For 1440p or high-refresh gaming, look at cards with more VRAM and a higher power draw - just make sure your power supply can keep up.\n\nCheck the recommended PSU wattage on the product page before you buy, and use our compatibility checks on the product page to confirm your case and power supply will work together.',
    blogCategoryId: blogCategory.id,
    authorId: author.id,
    status: 'PUBLISHED',
    publishedAt: new Date(),
    isFeatured: true,
  });
  await findOrCreateBlogPost('building-a-quiet-pc', {
    title: 'Building a quiet PC without sacrificing performance',
    slug: 'building-a-quiet-pc',
    excerpt: 'Case airflow, fan curves and cooler choice - the three things that actually determine how loud your PC is.',
    content:
      'A quiet PC comes down to three things: case airflow, fan quality, and how hard your components have to work to stay cool.\n\nStart with a case that has good airflow rather than the most RGB. Pair it with larger, slower-spinning fans rather than small fast ones - bigger fans move the same air at a lower pitch.\n\nFinally, a well-sized cooler for your CPU means your fans rarely need to spin up in the first place.',
    blogCategoryId: blogCategory.id,
    authorId: author.id,
    status: 'PUBLISHED',
    publishedAt: new Date(),
  });

  const findOrCreatePage = (slug: string, create: Parameters<typeof prisma.page.create>[0]['data']) =>
    prisma.page.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.page.create({ data: create }));
  await findOrCreatePage('about-us', {
    slug: 'about-us',
    title: 'About UK Computer Shop',
    status: 'PUBLISHED',
    contentBlocks: 'We are an independent UK retailer based in Manchester, building and shipping PCs and components since day one.\n\nOur warehouse and workshop are open Monday to Saturday, and our team tests every custom build before it ships.',
  });

  const deliveryFaqCategory = await prisma.faqCategory.findFirst({ where: { name: 'Delivery & Returns' } }).then((existing) =>
    existing ?? prisma.faqCategory.create({ data: { name: 'Delivery & Returns', sortOrder: 1 } }),
  );
  const faqCount = await prisma.faq.count({ where: { faqCategoryId: deliveryFaqCategory.id } });
  if (faqCount === 0) {
    await prisma.faq.createMany({
      data: [
        { faqCategoryId: deliveryFaqCategory.id, question: 'How fast is delivery?', answer: 'Orders placed before 17:00 on a working day ship the same day, with free next-day delivery on orders over £75.', sortOrder: 1 },
        { faqCategoryId: deliveryFaqCategory.id, question: 'What is your returns policy?', answer: 'You can return most items within 30 days of delivery in their original packaging for a full refund.', sortOrder: 2 },
        { faqCategoryId: deliveryFaqCategory.id, question: 'Do you build custom PCs?', answer: 'Yes - every custom build is assembled and stress-tested for 48 hours at our Manchester workshop before it ships.', sortOrder: 3 },
      ],
    });
  }

  const testimonialCount = await prisma.testimonial.count();
  if (testimonialCount === 0) {
    await prisma.testimonial.createMany({
      data: [
        { name: 'Daniel H.', title: 'Verified buyer', quote: 'Ordered Tuesday afternoon, arrived Wednesday morning. Genuinely well packaged.', stars: 5, sortOrder: 1 },
        { name: 'Priya S.', title: 'Verified buyer', quote: 'Spec sheet matched the product to the letter, which is more than I can say for other retailers.', stars: 5, sortOrder: 2 },
        { name: 'Mark T.', title: 'Verified buyer', quote: 'No complaints about performance, and support answered my question the same day.', stars: 4, sortOrder: 3 },
      ],
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
