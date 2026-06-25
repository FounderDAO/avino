import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';

/**
 * Обёртка над ThrottlerGuard с поддержкой THROTTLE_DISABLED=true (M-3).
 *
 * Когда флаг включён (тест-окружение или dev без Redis-ограничений),
 * гард пропускает все запросы без проверки лимитов. В остальном —
 * полноценный ThrottlerGuard с поддержкой @Throttle() override'ов.
 */
@Injectable()
export class ConditionalThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.configService.get<boolean>('throttler.disabled')) {
      return true;
    }
    return super.canActivate(context);
  }
}
