import { readFileSync } from 'fs';
import { join } from 'path';

export type SeedVariant = {
  slug: string; title: string; price: number; salePrice?: number; stockQty: number;
  priceTiers?: { minQty: number; unitPrice: number }[];
};
export type SeedProduct = {
  title: string; slug: string; sku: string; brandSlug: string; categorySlug: string;
  description: string; specs: { label: string; value: string }[];
  whatsInTheBox: string[]; images: string[]; variants: SeedVariant[];
  // Generated pack variants share the product's specifications. Prototype kits do not.
  variantAttribute?: string;
};
export type Catalog = {
  categories: { slug: string; title: string; parentSlug?: string }[];
  brands: { slug: string; title: string }[];
  products: SeedProduct[];
};

export const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (value: number) => Math.round(value * 100) / 100;

type Blueprint = {
  slug: string; title: string; parentSlug: string; noun: string;
  brands: string[]; basePrice: number;
  specs: Record<string, string[]>;
};

// These are illustrative demo ranges, not manufacturer models or certified specifications.
// Every leaf has its own specification vocabulary and a bounded list of relevant brands.
export const blueprints: Blueprint[] = [
  { slug: 'combi-drills-hammer', title: 'Combi Drills & Hammer Drivers', parentSlug: 'power-tools', noun: 'Cordless Combi Drill', brands: ['DeWalt', 'Makita', 'Milwaukee', 'Bosch', 'Festool', 'Metabo', 'HiKOKI', 'Einhell', 'Ryobi', 'Worx'], basePrice: 89.99, specs: { 'Voltage': ['18 V'], 'Chuck capacity': ['13 mm'], 'Motor type': ['Brushless', 'Brushed'], 'Power source': ['Battery'], 'Tool supply': ['Body only'] } },
  { slug: 'drill-drivers-non-hammer', title: 'Drill Drivers (Non-Hammer)', parentSlug: 'power-tools', noun: 'Cordless Drill Driver', brands: ['DeWalt', 'Makita', 'Bosch', 'Metabo', 'Ryobi'], basePrice: 64.99, specs: { 'Voltage': ['12 V', '18 V'], 'Chuck capacity': ['10 mm', '13 mm'], 'Power source': ['Battery'], 'Tool supply': ['Body only'] } },
  { slug: 'impact-drivers', title: 'Impact Drivers', parentSlug: 'power-tools', noun: 'Cordless Impact Driver', brands: ['Milwaukee', 'DeWalt', 'Makita', 'HiKOKI', 'Einhell'], basePrice: 79.99, specs: { 'Voltage': ['18 V'], 'Drive size': ['1/4 inch hex'], 'Motor type': ['Brushless'], 'Tool supply': ['Body only'] } },
  { slug: 'sds-rotary-hammers', title: 'SDS / Rotary Hammers', parentSlug: 'power-tools', noun: 'SDS Plus Rotary Hammer', brands: ['Bosch', 'Makita', 'DeWalt', 'Metabo'], basePrice: 119.99, specs: { 'Power source': ['Mains'], 'Rated power': ['800 W', '900 W', '1000 W'], 'Chuck type': ['SDS Plus'], 'Operating modes': ['Drill / hammer drill / chisel'] } },
  { slug: 'angle-grinders', title: 'Angle Grinders', parentSlug: 'power-tools', noun: 'Angle Grinder', brands: ['Fein', 'Flex', 'Triton', 'Bosch', 'Makita'], basePrice: 54.99, specs: { 'Disc diameter': ['115 mm', '125 mm'], 'Power source': ['Mains'], 'Rated power': ['900 W', '1100 W'], 'Spindle thread': ['M14'] } },
  { slug: 'circular-saws', title: 'Circular Saws', parentSlug: 'power-tools', noun: 'Circular Saw', brands: ['Evolution', 'Scheppach', 'DeWalt', 'Makita'], basePrice: 99.99, specs: { 'Blade diameter': ['165 mm', '185 mm'], 'Power source': ['Mains'], 'Rated power': ['1200 W', '1400 W'], 'Application': ['Wood cutting'] } },
  { slug: 'screwdrivers', title: 'Screwdrivers & Sets', parentSlug: 'hand-tools', noun: 'Screwdriver Set', brands: ['Wera', 'Wiha', 'Draper', 'Sealey', 'Silverline'], basePrice: 14.99, specs: { 'Pieces': ['6', '8', '12'], 'Tip type': ['Mixed slotted and Phillips', 'Torx'], 'Handle material': ['Bi-material'], 'Blade material': ['Steel'] } },
  { slug: 'spanners-sockets', title: 'Spanners & Sockets', parentSlug: 'hand-tools', noun: 'Combination Spanner Set', brands: ['Bahco', 'Teng Tools', 'Gedore', 'Facom', 'Britool'], basePrice: 24.99, specs: { 'Pieces': ['8', '10', '12'], 'Measurement system': ['Metric'], 'Material': ['Chrome vanadium steel'], 'Finish': ['Polished chrome', 'Satin chrome'] } },
  { slug: 'pliers-cutters', title: 'Pliers & Cutters', parentSlug: 'hand-tools', noun: 'Combination Pliers', brands: ['Knipex', 'Irwin', 'Stanley FatMax', 'NWS', 'CK Tools'], basePrice: 12.99, specs: { 'Length': ['160 mm', '180 mm', '200 mm'], 'Handle material': ['Bi-material'], 'Jaw material': ['Steel'], 'Application': ['Gripping and cutting'] } },
  { slug: 'timber-screws', title: 'Timber Screws', parentSlug: 'hardware-fixings', noun: 'Timber Screw Tub', brands: ['ForgeFast', 'Spax', 'Reisser', 'Timco'], basePrice: 9.99, specs: { 'Screw diameter': ['4 mm', '5 mm', '6 mm'], 'Screw length': ['40 mm', '60 mm', '80 mm'], 'Head type': ['Countersunk'], 'Drive type': ['Torx'], 'Pack quantity': ['100 screws'] } },
  { slug: 'wall-plugs-anchors', title: 'Wall Plugs & Anchors', parentSlug: 'hardware-fixings', noun: 'Nylon Wall Plug Pack', brands: ['Fischer', 'Rawlplug', 'TOGGLER'], basePrice: 4.99, specs: { 'Plug diameter': ['6 mm', '8 mm', '10 mm'], 'Material': ['Nylon'], 'Application': ['Solid masonry'], 'Pack quantity': ['50 plugs'] } },
  { slug: 'nuts-bolts-washers', title: 'Nuts, Bolts & Washers', parentSlug: 'hardware-fixings', noun: 'Hex Bolt and Nut Pack', brands: ['ForgeFix', 'Unifix', 'Timco'], basePrice: 5.99, specs: { 'Thread size': ['M6', 'M8', 'M10'], 'Bolt length': ['30 mm', '50 mm', '70 mm'], 'Finish': ['Zinc plated'], 'Pack quantity': ['20 sets'] } },
  { slug: 'electrical-cable', title: 'Electrical Cable', parentSlug: 'electrical-lighting', noun: 'Twin and Earth Cable Reel', brands: ['Prysmian', 'Doncaster Cables'], basePrice: 34.99, specs: { 'Conductor area': ['1.5 mm²', '2.5 mm²'], 'Cable length': ['25 m', '50 m'], 'Sheath colour': ['Grey'], 'Conductor material': ['Copper'] } },
  { slug: 'switches-sockets', title: 'Switches & Sockets', parentSlug: 'electrical-lighting', noun: 'Switched Socket', brands: ['MK Electric', 'BG Electrical', 'Click Scolmore'], basePrice: 5.99, specs: { 'Gang count': ['1', '2'], 'Rated current': ['13 A'], 'Finish': ['White', 'Brushed steel'], 'Mounting': ['Flush'] } },
  { slug: 'work-lighting', title: 'Work Lighting', parentSlug: 'electrical-lighting', noun: 'LED Work Light', brands: ['Luceco', 'Brennenstuhl', 'Sealey'], basePrice: 19.99, specs: { 'Rated power': ['20 W', '30 W', '50 W'], 'Power source': ['Mains'], 'Light colour': ['Cool white'], 'Mounting': ['Portable stand'] } },
  { slug: 'pipe-fittings', title: 'Pipe Fittings', parentSlug: 'plumbing-heating', noun: 'Straight Pipe Connector', brands: ['JG Speedfit', 'Hep2O', 'Pegler'], basePrice: 3.99, specs: { 'Pipe diameter': ['15 mm', '22 mm'], 'Fitting shape': ['Straight'], 'Application': ['Water pipe connection'] } },
  { slug: 'taps-mixers', title: 'Taps & Mixers', parentSlug: 'plumbing-heating', noun: 'Basin Mixer Tap', brands: ['Bristan', 'Grohe'], basePrice: 49.99, specs: { 'Finish': ['Chrome', 'Matt black'], 'Tap holes': ['1'], 'Handle type': ['Single lever'], 'Mounting': ['Deck mounted'] } },
  { slug: 'sealants', title: 'Sealants', parentSlug: 'plumbing-heating', noun: 'Sanitary Silicone Sealant', brands: ['Everbuild', 'Soudal', 'Bostik'], basePrice: 4.99, specs: { 'Volume': ['290 ml', '300 ml'], 'Colour': ['White', 'Clear'], 'Application': ['Bathroom sealing'], 'Container type': ['Cartridge'] } },
  { slug: 'garden-cutting-tools', title: 'Garden Cutting Tools', parentSlug: 'garden-outdoor', noun: 'Bypass Secateurs', brands: ['Fiskars', 'Gardena', 'Spear & Jackson'], basePrice: 14.99, specs: { 'Cutting action': ['Bypass'], 'Blade material': ['Steel'], 'Handle material': ['Composite'], 'Application': ['Pruning live stems'] } },
  { slug: 'watering-irrigation', title: 'Watering & Irrigation', parentSlug: 'garden-outdoor', noun: 'Garden Hose', brands: ['Hozelock', 'Gardena'], basePrice: 19.99, specs: { 'Hose length': ['15 m', '25 m', '30 m'], 'Hose diameter': ['12.5 mm'], 'Application': ['Garden watering'] } },
  { slug: 'pressure-washers', title: 'Pressure Washers', parentSlug: 'garden-outdoor', noun: 'Electric Pressure Washer', brands: ['Kärcher', 'Nilfisk'], basePrice: 89.99, specs: { 'Power source': ['Mains'], 'Rated power': ['1400 W', '1600 W'], 'Hose length': ['5 m', '6 m'], 'Application': ['Outdoor cleaning'] } },
  { slug: 'tile-adhesives', title: 'Tile Adhesives', parentSlug: 'building-materials', noun: 'Powder Tile Adhesive', brands: ['Mapei', 'Sika', 'Bostik'], basePrice: 14.99, specs: { 'Bag weight': ['10 kg', '20 kg'], 'Colour': ['Grey', 'White'], 'Application': ['Tiling'], 'Supply form': ['Powder'] } },
  { slug: 'cement-mortar', title: 'Cement & Mortar', parentSlug: 'building-materials', noun: 'General Purpose Cement', brands: ['Blue Circle', 'Hanson'], basePrice: 7.99, specs: { 'Bag weight': ['25 kg'], 'Supply form': ['Powder'], 'Application': ['General building'] } },
  { slug: 'paint-brushes', title: 'Paint Brushes', parentSlug: 'painting-decorating', noun: 'Paint Brush', brands: ['Hamilton', 'Harris', 'Purdy'], basePrice: 4.99, specs: { 'Brush width': ['25 mm', '50 mm', '75 mm'], 'Bristle material': ['Synthetic'], 'Handle material': ['Wood'] } },
  { slug: 'paint-rollers', title: 'Paint Rollers & Trays', parentSlug: 'painting-decorating', noun: 'Roller and Tray Set', brands: ['Hamilton', 'Harris', 'Purdy'], basePrice: 9.99, specs: { 'Roller width': ['100 mm', '230 mm'], 'Pile': ['Medium'], 'Application': ['Walls and ceilings'], 'Tray included': ['Yes'] } },
  { slug: 'eye-protection', title: 'Eye Protection', parentSlug: 'safety-ppe', noun: 'Safety Glasses', brands: ['Bollé', '3M', 'Uvex'], basePrice: 6.99, specs: { 'Lens colour': ['Clear', 'Smoke'], 'Lens material': ['Polycarbonate'], 'Frame type': ['Wraparound'] } },
  { slug: 'work-gloves', title: 'Work Gloves', parentSlug: 'safety-ppe', noun: 'General Handling Gloves', brands: ['Ansell', 'Portwest'], basePrice: 4.99, specs: { 'Glove size': ['M', 'L', 'XL'], 'Coating': ['Nitrile', 'PU'], 'Liner material': ['Polyester'], 'Application': ['General handling'] } },
  { slug: 'tool-boxes', title: 'Tool Boxes', parentSlug: 'storage', noun: 'Portable Tool Box', brands: ['Stanley FatMax', 'DeWalt', 'Makita', 'Milwaukee', 'Keter'], basePrice: 24.99, specs: { 'Material': ['Plastic'], 'Lid type': ['Hinged'], 'Carry handle': ['Yes'], 'Removable tray': ['Yes', 'No'] } },
  { slug: 'tool-bags', title: 'Tool Bags', parentSlug: 'storage', noun: 'Open Tool Tote', brands: ['Stanley FatMax', 'Veto Pro Pac', 'ToughBuilt'], basePrice: 29.99, specs: { 'Material': ['Polyester'], 'Base type': ['Rigid'], 'Shoulder strap': ['Included'], 'Pocket count': ['12', '16', '20'] } },
  { slug: 'workshop-shelving', title: 'Workshop Shelving', parentSlug: 'storage', noun: 'Workshop Shelving Unit', brands: ['Draper', 'Sealey'], basePrice: 49.99, specs: { 'Frame material': ['Steel'], 'Shelf count': ['4', '5'], 'Assembly': ['Boltless'], 'Finish': ['Galvanised', 'Painted'] } },
];

export const PRODUCTS_PER_CATEGORY = 22;

export function buildCatalog(): Catalog {
  const source: Catalog = JSON.parse(readFileSync(join(__dirname, 'fixtures/buildivo-catalog.json'), 'utf8'));
  const categories = [...source.categories.filter((c) => !c.parentSlug), ...blueprints.map(({ slug, title, parentSlug }) => ({ slug, title, parentSlug }))];
  const brands = new Map(source.brands.map((b) => [b.slug, b]));
  const products = [...source.products];
  const attributeTitles = new Map(source.products.flatMap((p) => p.specs.map((s) => [slugify(s.label), s.label] as const)));
  for (const blueprint of blueprints) {
    for (const label of Object.keys(blueprint.specs)) {
      if (!attributeTitles.has(slugify(label))) attributeTitles.set(slugify(label), label);
    }
  }
  for (const [categoryIndex, blueprint] of blueprints.entries()) {
    for (const title of blueprint.brands) brands.set(slugify(title), { slug: slugify(title), title });
    for (let index = 0; index < PRODUCTS_PER_CATEGORY; index += 1) {
      const brand = blueprint.brands[index % blueprint.brands.length];
      const code = `BLD-DEMO-${String(categoryIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(3, '0')}`;
      const specs = Object.entries(blueprint.specs).map(([label, values], specIndex) => ({ label: attributeTitles.get(slugify(label))!, value: values[Math.floor(index / (specIndex + 1)) % values.length] }));
      const basePrice = money(blueprint.basePrice * (1 + (index % 6) * 0.08));
      const packCounts = index % 4 === 0 ? [1, 2, 4] : [1];
      const title = `${brand} ${blueprint.noun} — Demo ${String(index + 1).padStart(2, '0')}`;
      products.push({
        title, slug: `demo-${blueprint.slug}-${slugify(brand)}-${index + 1}`, sku: code,
        brandSlug: slugify(brand), categorySlug: blueprint.slug,
        description: `Demonstration listing for a ${blueprint.noun.toLowerCase()} in Buildivo's ${blueprint.title} range. Sample specifications: ${specs.map((s) => `${s.label}: ${s.value}`).join('; ')}. Prices and stock are fictional test data; this is not a verified ${brand} model or an offer for sale.`,
        specs, images: [], whatsInTheBox: [`1 × ${blueprint.noun.toLowerCase()}${blueprint.specs['Tool supply'] ? ' (body only; battery and charger not included)' : ''}`],
        ...(packCounts.length > 1 ? { variantAttribute: 'Multipack size' } : {}),
        variants: packCounts.map((count, variantIndex) => {
          const price = money(basePrice * count * (count === 1 ? 1 : 0.95));
          const salePrice = index % 5 === 0 ? money(price * 0.9) : undefined;
          return {
            slug: `pack-${count}`, title: count === 1 ? 'Single unit' : `${count}-unit multipack`, price,
            ...(salePrice !== undefined ? { salePrice } : {}),
            stockQty: index % 11 === 0 ? 0 : index % 7 === 0 ? 3 : 10 + ((categoryIndex * 13 + index * 7 + variantIndex * 5) % 91),
            priceTiers: [{ minQty: 5, unitPrice: money((salePrice ?? price) * 0.95) }, { minQty: 10, unitPrice: money((salePrice ?? price) * 0.9) }],
          };
        }),
      });
    }
  }
  return { categories, brands: [...brands.values()], products };
}
