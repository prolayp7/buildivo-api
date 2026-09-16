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
  await prisma.taxRate.upsert({
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

  // Buildivo categories, brands, attributes and linked demo products.
  const productSeedResult = await seedProducts(prisma);
  console.log('Buildivo catalogue:', productSeedResult);

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

  // Department icons - shown on the storefront's category tiles and
  // department dropdown; falls back to a generic icon in the frontend
  // adapter when unset, so this only needs to cover the top-level departments.
  const departmentIcons: Record<string, string> = {
    'power-tools': 'bolt',
    'hand-tools': 'construction',
    'hardware-fixings': 'hardware',
    'electrical-lighting': 'electrical_services',
    'plumbing-heating': 'plumbing',
    'garden-outdoor': 'yard',
    'building-materials': 'foundation',
    'painting-decorating': 'format_paint',
    'safety-ppe': 'shield_person',
    storage: 'inventory_2',
  };
  for (const [slug, icon] of Object.entries(departmentIcons)) {
    await prisma.category.updateMany({ where: { slug, parentId: null, deletedAt: null }, data: { icon } });
  }

  // Main menu - the storefront's top nav bar. Each item links to either a
  // category or a special page (href); the departments dropdown is not a
  // menu at all, it's auto-derived from the live category tree above.
  const mainMenu = await prisma.menu.upsert({
    where: { slug: 'main' },
    update: {},
    create: { name: 'Main menu', slug: 'main', location: 'HEADER' },
  });
  const topLevelCategories = await prisma.category.findMany({
    where: { parentId: null, deletedAt: null, status: 'ACTIVE' },
    orderBy: { sortOrder: 'asc' },
  });
  for (const [index, category] of topLevelCategories.entries()) {
    const existing = await prisma.menuItem.findFirst({ where: { menuId: mainMenu.id, categoryId: category.id } });
    if (!existing) {
      await prisma.menuItem.create({ data: { menuId: mainMenu.id, label: category.title, categoryId: category.id, sortOrder: index } });
    }
  }
  const specialPages: { label: string; href: string; icon: string }[] = [
    { label: 'Deals & Clearance', href: '/deals', icon: 'local_fire_department' },
    { label: 'Top Brands', href: '/brands', icon: 'star' },
  ];
  for (const [index, page] of specialPages.entries()) {
    const existing = await prisma.menuItem.findFirst({ where: { menuId: mainMenu.id, href: page.href } });
    if (!existing) {
      await prisma.menuItem.create({ data: { menuId: mainMenu.id, label: page.label, href: page.href, icon: page.icon, sortOrder: topLevelCategories.length + index } });
    }
  }

  // Footer menu - four link columns, admin-editable. Column titles are
  // top-level items; each column's links are child items (matching the
  // storefront's site-footer.tsx, which used to hardcode this exact copy).
  const footerMenu = await prisma.menu.upsert({
    where: { slug: 'footer' },
    update: {},
    create: { name: 'Footer', slug: 'footer', location: 'FOOTER' },
  });
  const footerColumns: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: 'Departments',
      links: [
        { label: 'Heavy Machinery & Cordless', href: '/c/power-tools' },
        { label: 'Plumbing & Drainage Supplies', href: '/c/plumbing-heating' },
        { label: 'Industrial Fixings & Fasteners', href: '/c/hardware-fixings' },
        { label: 'Commercial Lighting & Cabling', href: '/c/electrical-lighting' },
        { label: 'Safety Boots & Hi-Vis Wear', href: '/c/safety-ppe' },
        { label: 'Paints, Primers & Coatings', href: '/c/painting-decorating' },
        { label: 'Modular Site Storage Packs', href: '/c/storage' },
      ],
    },
    {
      title: 'Trade & Wholesale',
      links: [
        { label: 'Trade Credit Application (Net 30)', href: '/trade' },
        { label: 'Bulk Purchasing & Tender Quotes', href: '/trade' },
        { label: 'Dedicated Account Managers', href: '/trade' },
        { label: 'Site Delivery Logistics', href: '/trade' },
        { label: 'Export & Offshore Supply', href: '/trade' },
        { label: 'Contractor Fleet Solutions', href: '/trade' },
      ],
    },
    {
      title: 'Customer Support',
      links: [
        { label: 'Order Tracking & Proof of Delivery', href: '/track-order' },
        { label: 'Returns, Refunds & Restocking', href: '/help' },
        { label: 'Warranty & Service Centers', href: '/help' },
        { label: 'Click & Collect Locations', href: '/branches' },
        { label: 'Recall & Safety Notices', href: '/help' },
        { label: 'Contact Technical Desk', href: '/help' },
      ],
    },
    {
      title: 'Guides & Tools',
      links: [
        { label: 'Brick & Mortar Calculator', href: '/calculators' },
        { label: 'Cable Sizing & Voltage Drops', href: '/calculators' },
        { label: 'Radiator BTU Heating Guide', href: '/guides' },
        { label: 'Fixings Load Bearing Charts', href: '/guides' },
        { label: 'Safety Regulations (HSE/OSHA)', href: '/guides' },
        { label: 'Apprentice Tool Kits', href: '/guides' },
      ],
    },
  ];
  for (const [columnIndex, column] of footerColumns.entries()) {
    let columnItem = await prisma.menuItem.findFirst({ where: { menuId: footerMenu.id, label: column.title, parentId: null } });
    if (!columnItem) {
      columnItem = await prisma.menuItem.create({ data: { menuId: footerMenu.id, label: column.title, sortOrder: columnIndex } });
    }
    for (const [linkIndex, link] of column.links.entries()) {
      const existing = await prisma.menuItem.findFirst({ where: { menuId: footerMenu.id, parentId: columnItem.id, href: link.href, label: link.label } });
      if (!existing) {
        await prisma.menuItem.create({ data: { menuId: footerMenu.id, parentId: columnItem.id, label: link.label, href: link.href, sortOrder: linkIndex } });
      }
    }
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
  const powerTools = topLevelCategories.find((c) => c.slug === 'power-tools');
  if (powerTools) {
    await findOrCreateBanner('home-power-tools', {
      title: 'Power Tools', slug: 'home-power-tools', linkType: 'CATEGORY', categoryId: powerTools.id, position: 'home-top', displayOrder: 1,
    });
  }
  const handTools = topLevelCategories.find((c) => c.slug === 'hand-tools');
  if (handTools) {
    await findOrCreateBanner('home-hand-tools', {
      title: 'Hand Tools', slug: 'home-hand-tools', linkType: 'CATEGORY', categoryId: handTools.id, position: 'home-top', displayOrder: 2,
    });
  }

  const findOrCreateFeaturedSection = (slug: string, create: Parameters<typeof prisma.featuredSection.create>[0]['data']) =>
    prisma.featuredSection.findFirst({ where: { slug } }).then((existing) => existing ?? prisma.featuredSection.create({ data: create }));
  await findOrCreateFeaturedSection('new-arrivals', { title: 'New Arrivals', slug: 'new-arrivals', sectionType: 'NEWLY_ADDED', sortOrder: 1 });
  await findOrCreateFeaturedSection('best-sellers', { title: 'Best Sellers', slug: 'best-sellers', sectionType: 'BEST_SELLER', sortOrder: 2 });
  await findOrCreateFeaturedSection('top-rated', { title: 'Top Rated', slug: 'top-rated', sectionType: 'TOP_RATED', sortOrder: 3 });

  // Homepage section ordering/visibility - one row per section that actually
  // renders on the storefront homepage (src/app/(storefront)/page.tsx),
  // in that page's real order. isVisible is the only thing an admin can
  // change here that the storefront actually respects.
  const findOrCreateHomepageSection = (type: Parameters<typeof prisma.homepageSection.create>[0]['data']['type'], data: Omit<Parameters<typeof prisma.homepageSection.create>[0]['data'], 'type'>) =>
    prisma.homepageSection.findFirst({ where: { type } }).then((existing) => existing ?? prisma.homepageSection.create({ data: { type, ...data } }));
  await findOrCreateHomepageSection('HERO', { label: 'Hero carousel', sortOrder: 0 });
  await findOrCreateHomepageSection('TRUST_STRIP', { label: 'Trust strip', sortOrder: 1 });
  await findOrCreateHomepageSection('DEPARTMENTS', { label: 'Shop by Department', sortOrder: 2 });
  await findOrCreateHomepageSection('FEATURED_PRODUCTS', { label: 'Featured Pro Tools', sortOrder: 3 });
  await findOrCreateHomepageSection('PROJECT_KITS', { label: 'Shop by Complete Job', sortOrder: 4 });
  await findOrCreateHomepageSection('TRADE_CTA', { label: 'Unlock Net Pricing & 30-Day Credit Lines', sortOrder: 5 });
  await findOrCreateHomepageSection('CALCULATORS', { label: 'Interactive Material Calculators', sortOrder: 6 });
  await findOrCreateHomepageSection('ECOSYSTEM_MATCHER', { label: 'Ecosystem Matcher', sortOrder: 7 });

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
