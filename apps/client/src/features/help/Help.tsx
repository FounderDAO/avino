/**
 * Help — справочный центр Avino: аккордеон FAQ (Faq) + блок контактов
 * поддержки (HelpContact: форма обращения + Telegram).
 */
import * as React from 'react';
import { Faq } from './Faq';
import { HelpContact } from './HelpContact';

export function Help() {
  return (
    <div className="pb-16">
      {/* Поиск + категории + аккордеон вопросов (клиентский) */}
      <Faq />
      {/* Контакты поддержки: модалка обращения + Telegram */}
      <HelpContact />
    </div>
  );
}
