export interface ExchangeRateView {
  base: 'USD';
  quote: 'UZS';
  rate: string;
  fetched_at: string;
  source: 'CBU' | 'MANUAL';
}
