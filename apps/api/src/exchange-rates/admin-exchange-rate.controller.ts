import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateView } from './exchange-rate.types';
import { SetExchangeRateDto } from './dto/set-exchange-rate.dto';

@Controller({ path: 'admin/exchange-rate', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get()
  async get(): Promise<{ current: ExchangeRateView | null; history: ExchangeRateView[] }> {
    return {
      current: await this.service.getCurrent(),
      history: await this.service.listHistory(),
    };
  }

  @Put()
  set(
    @CurrentUser('id') adminId: string,
    @Body() dto: SetExchangeRateDto,
  ): Promise<ExchangeRateView> {
    return this.service.setManual(adminId, dto.rate);
  }

  @Post('refresh')
  async refresh(): Promise<ExchangeRateView | null> {
    await this.service.refreshFromCbu();
    return this.service.getCurrent();
  }
}
