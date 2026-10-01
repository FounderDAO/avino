import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis';

const LOCK_KEY = 'listing-import:lock';
/** С запасом на 500 строк; страховка от «вечной» блокировки при падении процесса. */
const LOCK_TTL_SECONDS = 300;

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
