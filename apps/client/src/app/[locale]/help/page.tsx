/**
 * /help — справочный центр Avino.
 * Server-страница: метаданные + рендер фичи Help (внутри неё клиентский аккордеон).
 */
import type { Metadata } from 'next';
import { Help } from '@/features/help/Help';

export const metadata: Metadata = {
  title: 'Помощь — Avino',
  description:
    'Справочный центр Avino: частые вопросы о поиске, размещении и продвижении объявлений, аккаунте и безопасной сделке. Поддержка Support@avino.uz.',
};

export default function HelpPage() {
  return <Help />;
}
