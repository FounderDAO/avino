/**
 * Ключи FAQ главной (контент — home.faq.items.*). Отдельный модуль, не 'use client':
 * их читает и аккордеон Faq, и серверная разметка FAQPage на главной.
 */
export const HOME_FAQ_KEYS = ['price', 'contact', 'moderation', 'languages', 'map'] as const;
