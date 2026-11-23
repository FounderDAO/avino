/**
 * Вопросы справочного центра [категория, ключ help.faq.items.{key}]. Отдельный
 * модуль, не 'use client': его читает и аккордеон Faq, и серверная разметка FAQPage.
 */
export type HelpCatKey = 'buyers' | 'owners' | 'account';

export const HELP_FAQ: ReadonlyArray<readonly [HelpCatKey, string]> = [
  ['buyers', 'favorites'],
  ['buyers', 'savedSearch'],
  ['buyers', 'contactAuthor'],
  ['owners', 'postListing'],
  ['owners', 'moderation'],
  ['owners', 'topVip'],
  ['owners', 'rejected'],
  ['account', 'login'],
  ['account', 'language'],
  ['account', 'safeDeal'],
];
