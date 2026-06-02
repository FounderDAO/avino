import { Controller, Get } from '@nestjs/common';

// Explicit version per CLAUDE.md §14 → GET /api/v1/health
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'avino-api' };
  }
}
