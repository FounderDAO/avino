/**
 * HelpContact — блок «Не нашли ответ?» на странице «Помощь».
 *
 * «Написать в поддержку» открывает SupportModal (обращение уходит в админку),
 * «Открыть чат» ведёт в Telegram поддержки. Клиентский компонент — модалка и
 * состояние; сам Help остаётся серверным.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SupportModal } from './SupportModal';

/** Аккаунт поддержки в Telegram («Открыть чат»). */
const SUPPORT_TELEGRAM_URL = 'https://t.me/avino_support';

export function HelpContact() {
  const t = useTranslations('help');
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <section className="mx-auto max-w-[1200px] px-6 pt-14">
      <div className="grid items-center gap-7 rounded-[22px] bg-ink px-6 py-10 text-white sm:grid-cols-[1fr_auto] sm:px-11">
        <div>
          <h2 className="text-[28px] text-white">{t('contact.title')}</h2>
          <p className="mt-2 max-w-[460px] text-base text-white/70">
            {t.rich('contact.text', {
              b: (chunks) => <b className="text-white">{chunks}</b>,
            })}
          </p>
        </div>
        <div className="flex flex-col gap-3.5">
          <Button size="lg" className="justify-center" onClick={() => setModalOpen(true)}>
            <MessageCircle size={18} /> {t('contact.write')}
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-white/30 bg-transparent text-white hover:bg-white/10"
          >
            <a href={SUPPORT_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
              {t('contact.openChat')}
            </a>
          </Button>
        </div>
      </div>
      <SupportModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
}
