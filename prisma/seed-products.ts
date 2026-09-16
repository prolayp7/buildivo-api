import { Prisma, PrismaClient } from '@prisma/client';

type Blueprint = {
  noun: string;
  brands: string[];
  models: string[];
  configurations: string[];
  basePrice: number;
  priceStep: number;
  warrantyMonths: number;
  weightKg: number;
  dimensions: [number, number, number];
  features: string[];
};

const BLUEPRINTS: Record<string, Blueprint> = {
  'pc-components': { noun: 'PC Upgrade Bundle', brands: ['corsair', 'asus', 'msi', 'gigabyte', 'crucial'], models: ['Core Builder', 'Performance Kit', 'Creator Pack', 'Gaming Upgrade', 'Enthusiast Bundle'], configurations: ['Essential', 'Plus', 'Pro', 'Ultimate'], basePrice: 179.99, priceStep: 65, warrantyMonths: 24, weightKg: 2.4, dimensions: [42, 31, 16], features: ['matched components', 'desktop compatibility', 'upgrade-ready design', 'UK warranty'] },
  'cpus-processors': { noun: 'Desktop Processor', brands: ['amd', 'intel'], models: ['Ryzen 5 7600', 'Core i5-14400F', 'Ryzen 7 7700X', 'Core i7-14700K', 'Ryzen 9 7900X'], configurations: ['Retail Box', 'Performance Edition', 'Creator Edition', 'Gaming Edition'], basePrice: 189.99, priceStep: 78, warrantyMonths: 36, weightKg: 0.12, dimensions: [13, 13, 8], features: ['multi-core performance', 'virtualisation support', 'high-speed memory support', 'boxed UK warranty'] },
  'graphics-cards': { noun: 'Graphics Card', brands: ['nvidia', 'amd', 'asus', 'msi', 'gigabyte'], models: ['GeForce RTX 4060', 'Radeon RX 7600', 'GeForce RTX 4070 SUPER', 'Radeon RX 7800 XT', 'GeForce RTX 4080 SUPER'], configurations: ['8GB Dual Fan', '12GB OC', '16GB Triple Fan', 'Creator Edition'], basePrice: 289.99, priceStep: 155, warrantyMonths: 36, weightKg: 1.25, dimensions: [32, 14, 6], features: ['hardware ray tracing', 'high-refresh gaming', 'advanced cooling', 'multiple display outputs'] },
  motherboards: { noun: 'Motherboard', brands: ['asus', 'msi', 'gigabyte'], models: ['Prime B650', 'MAG B760', 'AORUS X670', 'TUF Z790', 'PRO B650M'], configurations: ['Micro ATX WiFi', 'ATX WiFi', 'ATX Gaming', 'Creator Edition'], basePrice: 109.99, priceStep: 52, warrantyMonths: 36, weightKg: 1.1, dimensions: [34, 27, 7], features: ['PCIe expansion', 'high-speed M.2 storage', 'USB connectivity', 'UEFI firmware'] },
  'memory-ram': { noun: 'Desktop Memory Kit', brands: ['corsair', 'crucial', 'kingston'], models: ['Vengeance DDR5', 'Pro DDR5', 'Fury Beast DDR5', 'Vengeance RGB', 'Fury Renegade'], configurations: ['16GB 5600MT/s', '32GB 6000MT/s', '48GB 6400MT/s', '64GB 6000MT/s'], basePrice: 54.99, priceStep: 34, warrantyMonths: 120, weightKg: 0.12, dimensions: [16, 9, 2], features: ['matched dual-channel kit', 'XMP or EXPO profiles', 'aluminium heat spreader', 'lifetime limited warranty'] },
  storage: { noun: 'Storage Drive', brands: ['samsung', 'western-digital', 'seagate', 'crucial', 'kingston'], models: ['990 EVO NVMe', 'Black SN850X', 'FireCuda 530', 'T500 NVMe', 'KC3000'], configurations: ['500GB', '1TB', '2TB', '4TB'], basePrice: 49.99, priceStep: 55, warrantyMonths: 60, weightKg: 0.04, dimensions: [8, 2.2, 0.3], features: ['NVMe performance', 'fast application loading', 'solid-state reliability', 'drive health monitoring'] },
  'pc-cases': { noun: 'PC Case', brands: ['corsair', 'nzxt', 'asus', 'msi'], models: ['Airflow 4000', 'H5 Flow', 'Prime AP201', 'MAG Forge', 'Elite 5000'], configurations: ['Black', 'White', 'Tempered Glass', 'RGB Edition'], basePrice: 69.99, priceStep: 29, warrantyMonths: 24, weightKg: 7.2, dimensions: [47, 23, 46], features: ['managed airflow', 'tempered-glass panel', 'cable-management space', 'radiator support'] },
  'power-supplies': { noun: 'Modular Power Supply', brands: ['corsair', 'asus', 'msi', 'gigabyte'], models: ['RM Series', 'ROG Strix', 'MAG A-GL', 'UD Gold', 'HX Series'], configurations: ['650W Gold', '750W Gold', '850W Gold', '1000W Platinum'], basePrice: 79.99, priceStep: 37, warrantyMonths: 84, weightKg: 1.8, dimensions: [18, 15, 9], features: ['80 PLUS efficiency', 'modular cabling', 'quiet cooling fan', 'electrical protection'] },
  cooling: { noun: 'PC Cooling Solution', brands: ['corsair', 'nzxt', 'asus', 'msi'], models: ['Hydro Series', 'Kraken', 'ROG Ryuo', 'MAG CoreLiquid', 'Performance Air'], configurations: ['120mm Air', '240mm AIO', '280mm AIO', '360mm AIO'], basePrice: 39.99, priceStep: 43, warrantyMonths: 36, weightKg: 1.1, dimensions: [40, 15, 12], features: ['efficient heat transfer', 'PWM fan control', 'low-noise operation', 'modern socket support'] },
  computers: { noun: 'Desktop Computer', brands: ['dell', 'hp', 'lenovo', 'acer', 'asus'], models: ['Everyday Tower', 'Home Office PC', 'Creator Desktop', 'Performance Desktop', 'Family PC'], configurations: ['Core i3 8GB 512GB', 'Core i5 16GB 1TB', 'Ryzen 7 32GB 1TB', 'Core i7 32GB 2TB'], basePrice: 429.99, priceStep: 240, warrantyMonths: 24, weightKg: 7.8, dimensions: [38, 18, 36], features: ['Windows 11', 'fast SSD storage', 'Wi-Fi and Bluetooth', 'UK keyboard and power lead'] },
  'gaming-pcs': { noun: 'Gaming PC', brands: ['asus', 'msi', 'acer', 'hp', 'lenovo'], models: ['ROG Strix', 'MAG Infinite', 'Predator Orion', 'OMEN Tower', 'Legion Tower'], configurations: ['RTX 4060 16GB', 'RTX 4070 32GB', 'RX 7800 XT 32GB', 'RTX 4080 64GB'], basePrice: 899.99, priceStep: 480, warrantyMonths: 24, weightKg: 12.5, dimensions: [48, 22, 47], features: ['dedicated gaming graphics', 'high-speed SSD', 'upgradeable chassis', 'optimised thermal design'] },
  'desktop-pcs': { noun: 'Desktop PC', brands: ['dell', 'hp', 'lenovo', 'acer'], models: ['Inspiron Desktop', 'Pavilion Tower', 'IdeaCentre', 'Aspire TC', 'ProDesk'], configurations: ['i3 8GB 512GB', 'i5 16GB 512GB', 'Ryzen 5 16GB 1TB', 'i7 32GB 1TB'], basePrice: 399.99, priceStep: 175, warrantyMonths: 24, weightKg: 6.4, dimensions: [36, 17, 34], features: ['daily productivity', 'SSD storage', 'wired and wireless connectivity', 'compact tower design'] },
  workstations: { noun: 'Professional Workstation', brands: ['dell', 'hp', 'lenovo'], models: ['Precision', 'Z Series', 'ThinkStation P', 'Precision Compact', 'ThinkStation Tower'], configurations: ['Entry CAD', 'Professional CAD', 'Data Science', 'Rendering Pro'], basePrice: 1299.99, priceStep: 850, warrantyMonths: 36, weightKg: 14, dimensions: [45, 21, 44], features: ['professional-grade processing', 'ECC-capable platform', 'expandable storage', 'business support'] },
  'mini-pcs': { noun: 'Mini PC', brands: ['intel', 'asus', 'msi', 'acer', 'lenovo'], models: ['NUC Compact', 'ExpertCenter Mini', 'Cubi', 'Revo Box', 'ThinkCentre Tiny'], configurations: ['N100 8GB 256GB', 'Core i3 16GB 512GB', 'Ryzen 5 16GB 1TB', 'Core i7 32GB 1TB'], basePrice: 229.99, priceStep: 155, warrantyMonths: 24, weightKg: 1.1, dimensions: [13, 13, 5], features: ['space-saving enclosure', 'dual-display support', 'Wi-Fi and Bluetooth', 'VESA mounting support'] },
  laptops: { noun: 'Laptop', brands: ['dell', 'hp', 'lenovo', 'acer', 'asus'], models: ['Inspiron 15', 'Pavilion 14', 'IdeaPad 5', 'Aspire 5', 'Vivobook 15'], configurations: ['i3 8GB 256GB', 'i5 16GB 512GB', 'Ryzen 7 16GB 1TB', 'i7 32GB 1TB'], basePrice: 429.99, priceStep: 210, warrantyMonths: 24, weightKg: 1.65, dimensions: [36, 24, 2], features: ['Full HD display', 'all-day productivity', 'Wi-Fi 6', 'UK-layout keyboard'] },
  'gaming-laptops': { noun: 'Gaming Laptop', brands: ['asus', 'msi', 'acer', 'lenovo', 'razer'], models: ['ROG Strix G16', 'Katana 15', 'Predator Helios', 'Legion 5', 'Blade 16'], configurations: ['RTX 4050 16GB', 'RTX 4060 16GB', 'RTX 4070 32GB', 'RTX 4080 32GB'], basePrice: 899.99, priceStep: 520, warrantyMonths: 24, weightKg: 2.45, dimensions: [36, 27, 2.6], features: ['high-refresh display', 'dedicated graphics', 'advanced laptop cooling', 'RGB keyboard'] },
  'business-laptops': { noun: 'Business Laptop', brands: ['dell', 'hp', 'lenovo'], models: ['Latitude 5000', 'EliteBook 800', 'ThinkPad T Series', 'ProBook 400', 'ThinkPad L Series'], configurations: ['i5 16GB 512GB', 'Ryzen 5 Pro 16GB', 'i7 16GB 1TB', 'i7 32GB 1TB'], basePrice: 749.99, priceStep: 280, warrantyMonths: 36, weightKg: 1.42, dimensions: [32, 22, 1.8], features: ['enterprise security', 'durable chassis', 'video conferencing', 'business-class support'] },
  ultrabooks: { noun: 'Ultrabook', brands: ['apple', 'dell', 'hp', 'lenovo', 'asus'], models: ['MacBook Air', 'XPS 13', 'Spectre x360', 'Yoga Slim', 'Zenbook S'], configurations: ['13-inch 8GB 256GB', '13-inch 16GB 512GB', '14-inch 16GB 1TB', '14-inch 32GB 1TB'], basePrice: 849.99, priceStep: 360, warrantyMonths: 24, weightKg: 1.25, dimensions: [31, 22, 1.5], features: ['thin-and-light design', 'high-resolution display', 'long battery life', 'premium construction'] },
  peripherals: { noun: 'Desktop Peripheral Bundle', brands: ['logitech', 'razer', 'corsair', 'asus'], models: ['Workspace Set', 'Creator Control Set', 'Gaming Essentials', 'Wireless Desk Set', 'Streaming Kit'], configurations: ['Essential', 'Wireless', 'Performance', 'Premium'], basePrice: 59.99, priceStep: 54, warrantyMonths: 24, weightKg: 1.4, dimensions: [48, 20, 8], features: ['coordinated accessories', 'plug-and-play setup', 'Windows and macOS support', 'UK retail packaging'] },
  monitors: { noun: 'Computer Monitor', brands: ['dell', 'samsung', 'asus', 'acer', 'msi'], models: ['UltraSharp', 'Odyssey', 'ProArt', 'Nitro', 'Optix'], configurations: ['24-inch FHD 100Hz', '27-inch QHD 165Hz', '32-inch 4K', '34-inch Ultrawide'], basePrice: 129.99, priceStep: 145, warrantyMonths: 36, weightKg: 5.8, dimensions: [62, 20, 46], features: ['sharp IPS or VA panel', 'adaptive refresh support', 'HDMI and DisplayPort', 'adjustable display settings'] },
  keyboards: { noun: 'Keyboard', brands: ['logitech', 'razer', 'corsair', 'asus'], models: ['MX Keys', 'BlackWidow', 'K70', 'ROG Strix Scope', 'Signature Keys'], configurations: ['Wired UK', 'Wireless UK', 'Mechanical RGB UK', 'Low-profile UK'], basePrice: 39.99, priceStep: 36, warrantyMonths: 24, weightKg: 0.82, dimensions: [45, 15, 4], features: ['UK key layout', 'responsive typing', 'durable keycaps', 'adjustable function controls'] },
  mice: { noun: 'Computer Mouse', brands: ['logitech', 'razer', 'corsair', 'asus'], models: ['MX Master', 'DeathAdder', 'Dark Core', 'ROG Gladius', 'G Pro'], configurations: ['Wired', 'Wireless', 'Lightweight', 'Ergonomic'], basePrice: 24.99, priceStep: 26, warrantyMonths: 24, weightKg: 0.11, dimensions: [13, 8, 5], features: ['precision optical sensor', 'programmable controls', 'comfortable grip', 'smooth tracking'] },
  headsets: { noun: 'Computer Headset', brands: ['logitech', 'razer', 'corsair', 'asus'], models: ['Zone', 'BlackShark', 'HS Series', 'ROG Delta', 'G Pro X'], configurations: ['Stereo Wired', 'USB Surround', 'Wireless', 'Premium ANC'], basePrice: 34.99, priceStep: 44, warrantyMonths: 24, weightKg: 0.32, dimensions: [22, 20, 10], features: ['clear microphone', 'comfortable ear cushions', 'balanced audio', 'PC and console compatibility'] },
  webcams: { noun: 'Webcam', brands: ['logitech', 'razer', 'dell', 'hp'], models: ['Brio', 'Kiyo', 'UltraSharp Webcam', 'Conference Cam', 'StreamCam'], configurations: ['1080p 30fps', '1080p 60fps', '2K HDR', '4K HDR'], basePrice: 39.99, priceStep: 48, warrantyMonths: 24, weightKg: 0.18, dimensions: [12, 6, 6], features: ['automatic light correction', 'integrated microphone', 'privacy control', 'USB connectivity'] },
  networking: { noun: 'Home Network Kit', brands: ['asus', 'dell', 'hp', 'lenovo'], models: ['Connected Home', 'Office Network', 'Mesh Starter', 'Gigabit Upgrade', 'Wi-Fi Performance'], configurations: ['Essential', 'Dual-band', 'Tri-band', 'Pro'], basePrice: 69.99, priceStep: 65, warrantyMonths: 36, weightKg: 0.85, dimensions: [24, 18, 8], features: ['secure network management', 'Gigabit connectivity', 'simple setup', 'IPv6 support'] },
  routers: { noun: 'Wireless Router', brands: ['asus', 'acer', 'msi'], models: ['RT Wi-Fi 6', 'ROG Rapture', 'Mesh Router', 'AX Performance', 'Whole Home Hub'], configurations: ['AX1800', 'AX3000', 'AX6000', 'Wi-Fi 7 BE'], basePrice: 59.99, priceStep: 76, warrantyMonths: 36, weightKg: 0.72, dimensions: [24, 16, 6], features: ['WPA3 security', 'Gigabit Ethernet', 'guest network', 'app-based management'] },
  'network-switches': { noun: 'Network Switch', brands: ['asus', 'dell', 'hp'], models: ['Gigabit Desktop', 'Smart Managed', 'Multi-Gig', 'PoE Office', 'Enterprise Access'], configurations: ['5 Port', '8 Port', '16 Port', '24 Port PoE'], basePrice: 24.99, priceStep: 58, warrantyMonths: 36, weightKg: 1.05, dimensions: [28, 18, 4], features: ['full-duplex Ethernet', 'energy-efficient operation', 'non-blocking switching', 'desktop or rack deployment'] },
  'wireless-adapters': { noun: 'Wireless Adapter', brands: ['asus', 'intel', 'msi'], models: ['USB Wi-Fi', 'PCIe Wi-Fi', 'Nano Wireless', 'Dual Antenna', 'Pro Wireless'], configurations: ['AC600', 'AC1300', 'AX1800', 'Wi-Fi 7 BE'], basePrice: 14.99, priceStep: 22, warrantyMonths: 24, weightKg: 0.08, dimensions: [12, 9, 3], features: ['dual-band wireless', 'secure encryption', 'Windows support', 'straightforward driver setup'] },
  software: { noun: 'PC Software Licence', brands: ['microsoft', 'norton', 'mcafee'], models: ['Home Essentials', 'Productivity Suite', 'Creative Toolkit', 'Business Tools', 'Family Software Pack'], configurations: ['1 Device 1 Year', '3 Devices 1 Year', '5 Devices 1 Year', 'Family 1 Year'], basePrice: 29.99, priceStep: 28, warrantyMonths: 12, weightKg: 0.02, dimensions: [19, 14, 1], features: ['digital activation', 'UK licence', 'automatic updates', 'online account management'] },
  'operating-systems': { noun: 'Operating System Licence', brands: ['microsoft'], models: ['Windows 11 Home', 'Windows 11 Pro', 'Windows 11 Pro for Workstations', 'Windows Server Essentials', 'Windows 11 Education'], configurations: ['Download', 'USB Retail', '1 Device', 'Digital Activation'], basePrice: 89.99, priceStep: 45, warrantyMonths: 12, weightKg: 0.03, dimensions: [19, 14, 1], features: ['genuine UK licence', 'security updates', 'modern desktop experience', 'digital activation'] },
  'security-software': { noun: 'Security Software Licence', brands: ['norton', 'mcafee'], models: ['360 Standard', 'Total Protection', '360 Deluxe', 'Internet Security', 'Family Security'], configurations: ['1 Device 1 Year', '3 Devices 1 Year', '5 Devices 1 Year', '10 Devices 1 Year'], basePrice: 19.99, priceStep: 18, warrantyMonths: 12, weightKg: 0.02, dimensions: [19, 14, 1], features: ['real-time threat protection', 'phishing protection', 'automatic security updates', 'UK digital licence'] },
};

const EXTRA_BRANDS = [
  ['Microsoft', 'microsoft'], ['Norton', 'norton'], ['McAfee', 'mcafee'],
] as const;

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (value: number) => Math.round(value * 100) / 100;

function upcFor(sequence: number): string {
  const body = `950${String(sequence).padStart(8, '0')}`.slice(0, 11);
  const sum = body.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function validateProductBlueprints(expectedCategories = 31, productsPerCategory = 20) {
  const slugs = Object.keys(BLUEPRINTS);
  if (slugs.length !== expectedCategories) throw new Error(`Expected ${expectedCategories} product blueprints, found ${slugs.length}.`);
  const productSlugs = new Set<string>();
  const skus = new Set<string>();
  const upcs = new Set<string>();
  let sequence = 1;
  let standardProducts = 0;
  let variableProducts = 0;
  let variants = 0;
  for (const [slug, blueprint] of Object.entries(BLUEPRINTS)) {
    const count = blueprint.models.length * blueprint.configurations.length;
    if (count !== productsPerCategory) throw new Error(`${slug} generates ${count} products instead of ${productsPerCategory}.`);
    if (blueprint.features.length < 4) throw new Error(`${slug} needs at least four product features.`);
    for (let modelIndex = 0; modelIndex < blueprint.models.length; modelIndex += 1) {
      for (let configIndex = 0; configIndex < blueprint.configurations.length; configIndex += 1) {
        const isVariable = (modelIndex * blueprint.configurations.length + configIndex) % 2 === 1;
        const brandSlug = blueprint.brands[(modelIndex + configIndex) % blueprint.brands.length];
        const productSlug = `${slug}-${slugify(`${brandSlug} ${blueprint.models[modelIndex]} ${blueprint.configurations[configIndex]}`)}`;
        const sku = `UKS-${slug.slice(0, 4).toUpperCase()}-${String(sequence).padStart(4, '0')}`;
        const upc = upcFor(sequence);
        if (productSlugs.has(productSlug)) throw new Error(`Duplicate generated product slug: ${productSlug}`);
        if (skus.has(sku)) throw new Error(`Duplicate generated SKU: ${sku}`);
        if (upcs.has(upc)) throw new Error(`Duplicate generated UPC: ${upc}`);
        productSlugs.add(productSlug);
        skus.add(sku);
        upcs.add(upc);
        if (isVariable) {
          variableProducts += 1;
          variants += blueprint.configurations.length;
        } else {
          standardProducts += 1;
          variants += 1;
        }
        sequence += 1;
      }
    }
  }
  const products = slugs.length * productsPerCategory;
  if (productSlugs.size !== products || skus.size !== products || upcs.size !== products) {
    throw new Error('Generated product identifiers are incomplete.');
  }
  if (standardProducts !== products / 2 || variableProducts !== products / 2 || variants !== 1550) {
    throw new Error(`Expected 310 standard products, 310 variable products and 1550 variants; generated ${standardProducts}, ${variableProducts} and ${variants}.`);
  }
  return { categories: slugs.length, products, standardProducts, variableProducts, variants, seoRecords: products };
}

export async function seedProducts(prisma: PrismaClient) {
  const expected = validateProductBlueprints();
  for (const [title, slug] of EXTRA_BRANDS) {
    await prisma.brand.upsert({ where: { slug }, update: { title, status: 'ACTIVE' }, create: { title, slug, status: 'ACTIVE' } });
  }

  const [categories, brands, suppliers, condition, taxRate] = await Promise.all([
    prisma.category.findMany({ where: { deletedAt: null, status: 'ACTIVE' } }),
    prisma.brand.findMany({ where: { status: 'ACTIVE' } }),
    prisma.supplier.findMany({ where: { status: 'ACTIVE' }, orderBy: { id: 'asc' } }),
    prisma.productCondition.findUniqueOrThrow({ where: { slug: 'new' } }),
    prisma.taxRate.findUniqueOrThrow({ where: { title: 'Standard' } }),
  ]);
  const categoryBySlug = new Map(categories.map((item) => [item.slug, item]));
  const brandBySlug = new Map(brands.map((item) => [item.slug, item]));
  const missing = Object.keys(BLUEPRINTS).filter((slug) => !categoryBySlug.has(slug));
  if (missing.length) throw new Error(`Missing active categories required by product seed: ${missing.join(', ')}`);
  if (suppliers.length === 0) throw new Error('At least one active supplier is required before seeding products.');
  const configurationAttribute = await prisma.productAttribute.findFirst({
    where: { slug: 'configuration', deletedAt: null },
  }).then((existing) => existing ?? prisma.productAttribute.create({
    data: { title: 'Configuration', slug: 'configuration', inputType: 'SELECT', isFilterable: true },
  }));
  const shippingMethods = await prisma.shippingMethod.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

  let sequence = 1;
  let created = 0;
  let updated = 0;
  for (const [categorySlug, blueprint] of Object.entries(BLUEPRINTS)) {
    const category = categoryBySlug.get(categorySlug)!;
    for (let modelIndex = 0; modelIndex < blueprint.models.length; modelIndex += 1) {
      for (let configIndex = 0; configIndex < blueprint.configurations.length; configIndex += 1) {
        const isVariable = (modelIndex * blueprint.configurations.length + configIndex) % 2 === 1;
        const brandSlug = blueprint.brands[(modelIndex + configIndex) % blueprint.brands.length];
        const brand = brandBySlug.get(brandSlug);
        if (!brand) throw new Error(`Missing brand ${brandSlug} required by ${categorySlug}.`);
        const supplier = suppliers[(sequence - 1) % suppliers.length];
        const model = blueprint.models[modelIndex];
        const configuration = blueprint.configurations[configIndex];
        const title = `${brand.title} ${model} ${configuration}`;
        const slug = `${categorySlug}-${slugify(title)}`;
        const retailPrice = money(blueprint.basePrice + modelIndex * blueprint.priceStep + configIndex * blueprint.priceStep * 0.42);
        const salePrice = sequence % 4 === 0 ? money(retailPrice * 0.9) : null;
        const upc = upcFor(sequence);
        const sku = `UKS-${categorySlug.slice(0, 4).toUpperCase()}-${String(sequence).padStart(4, '0')}`;
        const mpn = `${brandSlug.slice(0, 3).toUpperCase()}-${slugify(model).slice(0, 8).toUpperCase()}-${configIndex + 1}`;
        const shortDescription = `${configuration} ${blueprint.noun.toLowerCase()} with ${blueprint.features.slice(0, 2).join(' and ')}.`;
        const description = `${title} is a carefully specified ${blueprint.noun.toLowerCase()} for UK homes, gaming setups and professional workspaces. It combines ${blueprint.features.join(', ')} in a practical retail-ready package.\n\nThe ${configuration} configuration is selected for dependable everyday use and straightforward installation. The package includes the product, essential setup information and the applicable UK power accessory or digital activation details. Compatibility should always be checked against the destination system before ordering.\n\nSupplied through an established UK technology distributor, this item includes a ${blueprint.warrantyMonths}-month manufacturer or return-to-base warranty and a 30-day change-of-mind return window, subject to the store returns policy.`;
        const metaTitle = `${title} | Buy Online at UK Shop`.slice(0, 70);
        const metaDescription = `Shop the ${title} in the UK. ${shortDescription} Includes UK delivery, clear specifications and a ${blueprint.warrantyMonths}-month warranty.`.slice(0, 160);
        const data: Prisma.ProductUncheckedCreateInput = {
          categoryId: category.id, brandId: brand.id, supplierId: supplier.id, productConditionId: condition.id, taxRateId: taxRate.id,
          title, slug, sku, mpn, gtin: `00${upc}`, upc, shortDescription, description,
          specsSummary: { category: category.title, catalogueType: isVariable ? 'Variable product' : 'Standard product', productType: blueprint.noun, brand: brand.title, model, configuration, availableConfigurations: isVariable ? blueprint.configurations : [configuration], keyFeatures: blueprint.features, warranty: `${blueprint.warrantyMonths} months`, condition: 'New', countryOfSale: 'United Kingdom' },
          warrantyMonths: blueprint.warrantyMonths,
          allowCustomization: ['computers', 'gaming-pcs', 'desktop-pcs', 'workstations'].includes(categorySlug),
          customizationInstructions: ['computers', 'gaming-pcs', 'desktop-pcs', 'workstations'].includes(categorySlug) ? 'Contact support before dispatch to discuss compatible memory and storage upgrades.' : null,
          costPrice: money(retailPrice * 0.72), minimumOrderQuantity: 1, stockLocation: `WH-A-${String((sequence % 12) + 1).padStart(2, '0')}`,
          receiveLowStockAlert: true, outOfStockBehavior: 'DENY', inStockLabel: 'In stock – UK dispatch', outOfStockLabel: 'Temporarily unavailable',
          availabilityDate: new Date('2026-08-31T00:00:00.000Z'), deliveryTimeMode: 'CUSTOM', inStockDeliveryTime: '1–3 working days', outOfStockDeliveryTime: 'Usually available within 7–14 working days',
          additionalShippingCost: blueprint.weightKg >= 10 ? 9.99 : blueprint.weightKg >= 5 ? 4.99 : 0,
          isReturnable: true, returnableDays: 30, status: 'ACTIVE', isFeatured: sequence % 10 === 0, isTopProduct: sequence % 20 === 1,
          isIndexable: true, metaTitle, metaDescription, seoTags: [category.title.toLowerCase(), blueprint.noun.toLowerCase(), brand.title.toLowerCase(), configuration.toLowerCase(), 'uk delivery'],
          offlineRedirectBehavior: 'NOT_FOUND', redirectTargetCategoryId: null, deletedAt: null,
        };
        const existing = await prisma.product.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
        const product = existing
          ? await prisma.product.update({ where: { id: existing.id }, data })
          : await prisma.product.create({ data });
        await prisma.$executeRaw`UPDATE products SET product_type = CAST(${isVariable ? 'VARIABLE' : 'STANDARD'} AS "ProductType") WHERE id = ${product.id}`;
        existing ? updated += 1 : created += 1;

        const variantOptions = isVariable ? blueprint.configurations : ['Default'];
        const desiredVariantSlugs = variantOptions.map((option) => isVariable ? `${slug}-option-${slugify(option)}` : `${slug}-default`);
        await prisma.productVariant.updateMany({
          where: { productId: product.id, slug: { startsWith: `${slug}-`, notIn: desiredVariantSlugs } },
          data: { status: 'INACTIVE', deletedAt: new Date() },
        });
        for (let optionIndex = 0; optionIndex < variantOptions.length; optionIndex += 1) {
          const option = variantOptions[optionIndex];
          const variantSlug = desiredVariantSlugs[optionIndex];
          const optionPrice = isVariable ? money(retailPrice + (optionIndex - configIndex) * blueprint.priceStep * 0.18) : retailPrice;
          const safeOptionPrice = Math.max(0.99, optionPrice);
          const optionSalePrice = salePrice === null ? null : money(safeOptionPrice * 0.9);
          const variantData = {
            productId: product.id, title: option, slug: variantSlug,
            barcode: isVariable ? upcFor(10000 + sequence * 10 + optionIndex) : upc,
            price: safeOptionPrice, salePrice: optionSalePrice,
            stockQty: 8 + ((sequence + optionIndex) * 7) % 43, lowStockThreshold: 5, weightKg: blueprint.weightKg,
            lengthCm: blueprint.dimensions[0], widthCm: blueprint.dimensions[1], heightCm: blueprint.dimensions[2],
            isDefault: !isVariable || optionIndex === configIndex, status: 'ACTIVE' as const, deletedAt: null,
          };
          const existingVariant = await prisma.productVariant.findFirst({ where: { slug: variantSlug }, select: { id: true } });
          const variant = existingVariant
            ? await prisma.productVariant.update({ where: { id: existingVariant.id }, data: variantData })
            : await prisma.productVariant.create({ data: variantData });
          if (isVariable) {
            const configurationValue = await prisma.productAttributeValue.upsert({
              where: { attributeId_value: { attributeId: configurationAttribute.id, value: option } },
              update: {},
              create: { attributeId: configurationAttribute.id, value: option, sortOrder: optionIndex + 1 },
            });
            await prisma.productVariantAttribute.upsert({
              where: { productVariantId_attributeId: { productVariantId: variant.id, attributeId: configurationAttribute.id } },
              update: { attributeValueId: configurationValue.id },
              create: { productVariantId: variant.id, attributeId: configurationAttribute.id, attributeValueId: configurationValue.id },
            });
          } else {
            await prisma.productVariantAttribute.deleteMany({
              where: { productVariantId: variant.id, attributeId: configurationAttribute.id },
            });
          }
        }
        for (const shippingMethod of shippingMethods) {
          await prisma.productShippingMethod.upsert({
            where: { productId_shippingMethodId: { productId: product.id, shippingMethodId: shippingMethod.id } },
            update: {},
            create: { productId: product.id, shippingMethodId: shippingMethod.id },
          });
        }

        const faqCount = await prisma.productFaq.count({ where: { productId: product.id } });
        if (faqCount === 0) {
          await prisma.productFaq.createMany({ data: [
            { productId: product.id, question: `Is the ${title} supplied for UK use?`, answer: 'Yes. This listing is intended for the UK market and includes the appropriate UK power accessory or UK digital licence where applicable.', sortOrder: 1 },
            { productId: product.id, question: 'What warranty and returns cover is included?', answer: `The product includes a ${blueprint.warrantyMonths}-month warranty and is returnable within 30 days, subject to the published warranty and returns terms.`, sortOrder: 2 },
          ] });
        }
        sequence += 1;
      }
    }
  }
  if (sequence - 1 !== expected.products) throw new Error(`Generated ${sequence - 1} products instead of ${expected.products}.`);
  return { ...expected, created, updated };
}
