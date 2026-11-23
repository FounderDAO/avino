/**
 * Пункты FAQ лендинга /sell (контент — sell.faq.items.*). Отдельный модуль, не
 * 'use client': его читает и SellFaq, и серверная разметка FAQPage.
 */
export const SELL_FAQ_KEYS = ['price', 'speed', 'agent', 'languages'] as const;
