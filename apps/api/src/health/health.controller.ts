import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Health-проба зависимостей (ADR-0128, TASK-231).
 *
 * Раньше эндпоинт возвращал статический `{status:'ok'}` — повисшая БД давала
 * «healthy» api для compose-healthcheck и внешнего мониторинга. Теперь каждая
 * зависимость проверяется реальной командой с таймаутом: PostgreSQL —
 * `SELECT 1`, Redis — `PING`. Отказ любой из них → 503 с детализацией, чтобы
 * docker-compose healthcheck (`r.ok`) и uptime-монитор увидели деградацию.
 */
const PROBE_TIMEOUT_MS = 2000;

type ProbeState = 'up' | 'down';

// Explicit version per CLAUDE.md §14 → GET /api/v1/health
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.probe(() => this.prisma.$queryRaw`SELECT 1`),
      this.probe(() => this.redis.ping()),
    ]);

    const healthy = database === 'up' && redis === 'up';
    const body = {
      status: healthy ? 'ok' : 'degraded',
      service: 'avino-api',
      checks: { database, redis },
    };

    if (!healthy) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  private async probe(fn: () => Promise<unknown>): Promise<ProbeState> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        fn(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('health probe timeout')),
            PROBE_TIMEOUT_MS,
          );
        }),
      ]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
