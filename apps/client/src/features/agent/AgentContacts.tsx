/**
 * AgentContacts — блок связи в публичном профиле агента (ADR-0155).
 *
 * Клиентский островок внутри серверного AgentProfile: телефон прячется за
 * кнопкой и раскрывается по клику — тот же паттерн, что в карточке контакта
 * на деталке объявления (features/detail/ContactCard). E-mail показывается
 * сразу mailto-ссылкой.
 *
 * Кнопка/строка рендерятся только когда контакт реально есть: оба поля
 * nullable (агент мог войти по e-mail и не иметь телефона, и наоборот),
 * иначе элемент был бы «мёртвым». Нет ни одного контакта — секции нет
 * (за это отвечает вызывающая сторона, см. AgentProfile).
 *
 * Своей карточки-обёртки у секции нет: она — часть единой карточки профиля
 * (шапка + контакты + «О себе») и вставляется как блок внутрь неё
 * (AgentProfile), поэтому здесь только заголовок и контролы.
 *
 * Счётчика звонков здесь нет намеренно: POST /listings/:id/calls считает
 * звонки по объявлению, а у профиля агента объявления нет (ADR-0155 п.5).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AgentContactsProps {
  phone: string | null;
  email: string | null;
}

export function AgentContacts({ phone, email }: AgentContactsProps) {
  const t = useTranslations('agentProfile');
  const [phoneShown, setPhoneShown] = React.useState(false);

  return (
    <div>
      <h2 className="text-[16px] font-bold text-ink">{t('contacts.title')}</h2>

      <div className="mt-3.5 flex flex-col gap-2.5">
        {phone &&
          (phoneShown ? (
            <a
              href={`tel:${phone.replace(/\s/g, '')}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-ink px-7 py-4 text-base font-bold tracking-[-0.01em] text-white transition-colors hover:bg-black"
            >
              <Phone size={18} /> {phone}
            </a>
          ) : (
            <Button size="lg" className="w-full" onClick={() => setPhoneShown(true)}>
              <Phone size={18} /> {t('contacts.showPhone')}
            </Button>
          ))}

        {email && (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-2 break-all text-[14.5px] font-semibold text-teal hover:underline"
          >
            <Mail size={17} className="shrink-0" /> {email}
          </a>
        )}
      </div>
    </div>
  );
}
