import { Matches } from 'class-validator';

const DECIMAL = /^\d{1,12}(\.\d{1,6})?$/;

export class SetExchangeRateDto {
  @Matches(DECIMAL, { message: 'rate must be a positive decimal (<=6 fraction digits)' })
  rate!: string;
}
