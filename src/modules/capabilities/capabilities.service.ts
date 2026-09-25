import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ExtensionName = 'pg_trgm' | 'vector';
// enabled: created in this database. installable: present on the server but not created here
// (run CREATE EXTENSION). unavailable: not installed on the database server at all.
export type ExtensionState = 'enabled' | 'installable' | 'unavailable';

const EXTENSIONS: ExtensionName[] = ['pg_trgm', 'vector'];
const TTL_MS = 30_000;
const FAILURE_TTL_MS = 5_000;

// Detects optional Postgres extensions at runtime and re-checks every 30 seconds, so a feature that
// needs one switches itself on once the extension appears (and off if it disappears) with no redeploy.
@Injectable()
export class CapabilitiesService {
  private readonly logger = new Logger(CapabilitiesService.name);
  private cache: { expires: number; states: Record<ExtensionName, ExtensionState> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async extensions(): Promise<Record<ExtensionName, ExtensionState>> {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.states;
    const states = Object.fromEntries(EXTENSIONS.map((name) => [name, 'unavailable'])) as Record<ExtensionName, ExtensionState>;
    let ttl = TTL_MS;
    try {
      const [installed, available] = await Promise.all([
        this.prisma.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname = ANY(${EXTENSIONS})`,
        this.prisma.$queryRaw<{ name: string }[]>`SELECT name FROM pg_available_extensions WHERE name = ANY(${EXTENSIONS})`,
      ]);
      const installedNames = new Set(installed.map((row) => row.extname));
      const availableNames = new Set(available.map((row) => row.name));
      for (const name of EXTENSIONS) states[name] = installedNames.has(name) ? 'enabled' : availableNames.has(name) ? 'installable' : 'unavailable';
    } catch (error) {
      // Detection itself failed (e.g. restricted catalog access): treat everything as off, retry soon.
      ttl = FAILURE_TTL_MS;
      this.logger.warn(`Extension detection failed, optional features disabled: ${error instanceof Error ? error.message : error}`);
    }
    this.cache = { expires: Date.now() + ttl, states };
    return states;
  }

  async isEnabled(name: ExtensionName): Promise<boolean> {
    return (await this.extensions())[name] === 'enabled';
  }

  /** Forget the cached result, e.g. right after an admin enables an extension. */
  invalidate() {
    this.cache = null;
  }
}
