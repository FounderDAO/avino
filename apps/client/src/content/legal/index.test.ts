/**
 * index.test.ts — getLegalDoc резолвит документ по виду и локали, фолбэк на ru.
 */
import { it, expect } from 'vitest';
import { getLegalDoc } from './index';

it('возвращает Правила на нужном языке', () => {
  expect(getLegalDoc('terms', 'ru').title).toBe('Правила сервиса');
  expect(getLegalDoc('terms', 'uz').title).toBe('Xizmat qoidalari');
  expect(getLegalDoc('terms', 'en').title).toBe('Terms of Service');
});

it('возвращает Политику на нужном языке', () => {
  expect(getLegalDoc('privacy', 'en').title).toBe('Privacy Policy');
});

it('фолбэк на ru для неизвестной локали', () => {
  // @ts-expect-error — проверяем рантайм-фолбэк
  expect(getLegalDoc('terms', 'fr').title).toBe('Правила сервиса');
});
