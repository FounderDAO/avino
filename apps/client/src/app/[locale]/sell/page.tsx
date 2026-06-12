/**
 * /sell — лендинг «Продать/Сдать» для собственников и агентов.
 * Server component: рендерит секции Sell (интерактив — внутри SellFaq).
 */
import type { Metadata } from 'next';
import { Sell } from '@/features/sell/Sell';

export const metadata: Metadata = {
  title: 'Продать или сдать недвижимость — Avino',
  description:
    'Разместите объявление о продаже или аренде недвижимости в Узбекистане бесплатно. Прямые контакты с покупателями, автоперевод на 3 языка, продвижение TOP и VIP.',
};

export default function SellPage() {
  return <Sell />;
}
