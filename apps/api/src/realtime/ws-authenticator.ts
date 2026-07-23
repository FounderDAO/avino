import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

interface AccessPayload {
  sub: string;
}

/**
 * Верификация access-JWT на этапе socket-handshake. Тот же секрет и та же схема,
 * что у {@link JwtAuthGuard} (ADR-0010). Возвращает null на любой ошибке —
 * gateway по null дисконнектит соединение.
 */
@Injectable()
export class WsAuthenticator {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async verify(token: string | undefined): Promise<{ userId: string } | null> {
    if (!token) {
      return null;
    }
    const secret = this.config.get<string>('jwt.accessSecret')!;
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, { secret });
      return { userId: payload.sub };
    } catch {
      return null;
    }
  }
}
