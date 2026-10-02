import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis';

const LOCK_KEY = 'listing-import:lock';
/**
 * 500 строк интерактивными транзакциями на удалённой БД могут приблизиться к 300 с;
 * истечение TTL разрешило бы второй параллельный импорт. Страховка от «вечной»
 * блокировки при падении процесса.
 */
const LOCK_TTL_SECONDS = 900;

/**
 * Один импорт одновременно (спека 2026-10-02 §6): два параллельных запуска
 * одного файла создали бы дубли, проскочив проверку «уже существует».
 */
@Injectable()
export class ListingImportLock {
  constructor(private readonly redis: RedisService) {}

  /** Токен блокировки или `null`, если импорт уже идёт. */
  async acquire(): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(LOCK_KEY, token, 'EX', LOCK_TTL_SECONDS, 'NX');
    return result === 'OK' ? token : null;
  }

  /** Снимает только свою блокировку — чужую (после истечения TTL) не трогает. */
  async release(token: string): Promise<void> {
    if ((await this.redis.get(LOCK_KEY)) === token) {
      await this.redis.del(LOCK_KEY);
    }
  }
}
