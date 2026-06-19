import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateView } from './exchange-rate.types';

@Controller({ path: 'exchange-rate', version: '1' })
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  /** `GET /api/v1/exchange-rate` — текущий курс USD→UZS (публичный, кэшируемый). */
  @Get()
  async current(): Promise<ExchangeRateView> {
    const view = await this.service.getCurrent();
    if (!view) throw new NotFoundException('No exchange rate available');
    return view;
  }
}
