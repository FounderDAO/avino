/**
 * /sell/new — страница визарда создания объявления.
 * Рендерит клиентский ListingNew (формы — только моки, без отправки на API).
 */
import type { Metadata } from 'next';
import { ListingNew } from '@/features/listing-new/ListingNew';

export const metadata: Metadata = {
  title: 'Разместить объявление — Avino',
  description:
    'Создайте объявление о продаже или аренде недвижимости: тип, адрес, параметры, цена, фото, описание и контакты.',
};

export default function ListingNewPage() {
  return <ListingNew />;
}
