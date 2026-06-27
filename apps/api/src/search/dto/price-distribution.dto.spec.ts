import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PriceDistributionQueryDto } from './price-distribution.dto';

function errorsFor(obj: Record<string, unknown>) {
  return validateSync(plainToInstance(PriceDistributionQueryDto, obj), {
    whitelist: true,
  });
}

it('валиден при currency+transaction_type из enum', () => {
  expect(errorsFor({ currency: 'USD', transaction_type: 'SALE' })).toHaveLength(0);
});

it('400: отсутствует currency', () => {
  expect(errorsFor({ transaction_type: 'SALE' }).length).toBeGreaterThan(0);
});

it('400: невалидный transaction_type', () => {
  expect(errorsFor({ currency: 'USD', transaction_type: 'LEASE' }).length).toBeGreaterThan(0);
});
