import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// Root controller for /api/v1 — versioning is applied globally (CLAUDE.md §14).
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getInfo() {
    return this.appService.getInfo();
  }
}
