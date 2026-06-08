import type { Metadata } from 'next';
import { DealType } from '@avino/shared';
import { SearchPage } from '@/features/search/SearchPage';

export const metadata: Metadata = {
  title: 'Аренда недвижимости — Avino',
  description: 'Поиск объявлений об аренде недвижимости в Узбекистане',
};

export default function RentSearchPage() {
  return <SearchPage transactionType={DealType.RENT} />;
}
