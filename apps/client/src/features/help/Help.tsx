/**
 * Help — справочный центр Avino: аккордеон FAQ (Faq) + блок контактов поддержки.
 * Блок контактов статичный (Support@avino.uz) — без модалки/отправки (только моки).
 */
import * as React from 'react';
import { Link } from '@/i18n/navigation';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Faq } from './Faq';

export function Help() {
  return (
    <div className="pb-16">
      {/* Поиск + категории + аккордеон вопросов (клиентский) */}
      <Faq />

      {/* Контакты поддержки */}
      <section className="mx-auto max-w-[1200px] px-6 pt-14">
        <div className="grid items-center gap-7 rounded-[22px] bg-ink px-6 py-10 text-white sm:grid-cols-[1fr_auto] sm:px-11">
          <div>
            <h2 className="text-[28px] text-white">Не нашли ответ?</h2>
            <p className="mt-2 max-w-[460px] text-base text-white/70">
              Напишите в поддержку — отвечаем ежедневно с 9:00 до 21:00. Email:{' '}
              <b className="text-white">Support@avino.uz</b>
            </p>
          </div>
          <div className="flex flex-col gap-3.5">
            <Button asChild size="lg" className="justify-center">
              <a href="mailto:Support@avino.uz">
                <MessageCircle size={18} /> Написать в поддержку
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/30 bg-transparent text-white hover:bg-white/10"
            >
              <Link href="/account/inbox">Открыть чат</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
