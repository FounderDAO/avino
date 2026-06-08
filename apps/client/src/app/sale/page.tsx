import type { Metadata } from 'next';
import { DealType } from '@avino/shared';
import { SearchPage } from '@/features/search/SearchPage';

export const metadata: Metadata = {
  title: 'Продажа недвижимости — Avino',
  description: 'Поиск объявлений о продаже недвижимости в Узбекистане',
};

export default function SaleSearchPage() {
  return <SearchPage transactionType={DealType.SALE} />;
}
