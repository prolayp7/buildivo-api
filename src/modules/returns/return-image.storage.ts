import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { MAX_EVIDENCE_IMAGE_BYTES } from './return-rules';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp');

/** Return photos (customer evidence and admin inspection) are personal data, so they live outside the
 * public /uploads folder and are only ever served through signed-in endpoints. */
export const returnImageDirectory = resolve(process.env.RETURN_EVIDENCE_DIR ?? resolve(process.cwd(), 'private-uploads', 'return-evidence'));

const ACCEPTED_FORMATS = ['jpeg', 'png', 'webp'];

@Injectable()
export class ReturnImageStorage {
  /** Validates by decoding (not by the claimed file type), then re-encodes to WebP. Re-encoding drops
   * embedded metadata such as phone GPS location, and any payload hidden in the original file. */
  async save(file: { buffer: Buffer; size: number }): Promise<{ storageKey: string; mimeType: string; sizeBytes: number }> {
    if (file.size > MAX_EVIDENCE_IMAGE_BYTES) throw new BadRequestException('Each photo must be 10 MB or smaller');
    let format: string | undefined;
    try {
      format = (await sharp(file.buffer).metadata()).format;
    } catch {
      throw new BadRequestException('A photo could not be read. Please upload JPG, PNG or WEBP images.');
    }
    if (!format || !ACCEPTED_FORMATS.includes(format)) throw new BadRequestException('Photos must be JPG, PNG or WEBP images');

    const output: Buffer = await sharp(file.buffer).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const now = new Date();
    const storageKey = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.webp`;
    const target = this.path(storageKey);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, output);
    return { storageKey, mimeType: 'image/webp', sizeBytes: output.length };
  }

  async read(storageKey: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.path(storageKey));
    } catch {
      throw new NotFoundException('Image not found');
    }
  }

  async remove(storageKey: string): Promise<void> {
    await fs.unlink(this.path(storageKey)).catch(() => undefined);
  }

  /** Keys come from the database, but never let one escape the private folder. */
  private path(storageKey: string): string {
    const target = resolve(join(returnImageDirectory, storageKey));
    if (!target.startsWith(returnImageDirectory + sep)) throw new NotFoundException('Image not found');
    return target;
  }
}
