import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { fetchCbuUsdRate } from './cbu.provider';
import { ExchangeRateView } from './exchange-rate.types';

type Row = {
  base: string; quote: string; rate: string;
  source: string; fetchedAt: Date;
};

function toView(row: Row): ExchangeRateView {
  return {
    base: 'USD',
    quote: 'UZS',
    rate: String(row.rate),
    fetched_at: row.fetchedAt.toISOString(),
    source: row.source as 'CBU' | 'MANUAL',
  };
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getCurrent(): Promise<ExchangeRateView | null> {
    const row = await this.prisma.exchangeRate.findFirst({
      where: { base: 'USD', quote: 'UZS' },
      orderBy: { fetchedAt: 'desc' },
    });
    return row ? toView(row as unknown as Row) : null;
  }

  async listHistory(limit = 30): Promise<ExchangeRateView[]> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: { base: 'USD', quote: 'UZS' },
      orderBy: { fetchedAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => toView(r as unknown as Row));
  }

  async refreshFromCbu(): Promise<void> {
    const baseUrl =
      this.config.get<string>('exchangeRate.cbuBaseUrl') ?? 'https://cbu.uz';
    let rate: string;
    try {
      rate = await fetchCbuUsdRate(baseUrl);
    } catch (err) {
      this.logger.error(
        `CBU refresh failed, keeping last rate: ${(err as Error).message}`,
      );
      throw err; // keep last row; BullMQ retries
    }
    await this.prisma.exchangeRate.create({
      data: { base: 'USD', quote: 'UZS', rate, source: 'CBU' },
    });
    this.logger.log(`Exchange rate refreshed from CBU: 1 USD = ${rate} UZS`);
  }

  async setManual(adminId: string, rate: string): Promise<ExchangeRateView> {
    const row = await this.prisma.exchangeRate.create({
      data: { base: 'USD', quote: 'UZS', rate, source: 'MANUAL' },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'EXCHANGE_RATE_MANUAL_SET',
        entityType: 'exchange_rate',
        entityId: null,
        metadata: { rate },
      },
    });
    return toView(row as unknown as Row);
  }
}
