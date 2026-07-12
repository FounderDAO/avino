/**
 * Тесты для notificationContent — клиентский рендер заголовка/тела уведомления
 * из `type` + `data_json` (вариант C: текст собирается на клиенте через i18n,
 * т.к. бэкенд хранит только структуру, а title/body = NULL до подключения
 * EMAIL/PUSH-воркера).
 *
 * `t`-стаб повторяет паттерн остальных тестов: ключ → ключ с интерполяцией
 * `{param}` — так мы проверяем, что хелпер выбирает ПРАВИЛЬНЫЙ ключ и
 * прокидывает нужные значения, не завязываясь на конкретные переводы.
 */
import { describe, it, expect } from 'vitest';
import { notificationContent } from './notificationText';

const t = (key: string, params?: Record<string, string | number>): string =>
  params
    ? key.replace(/\{(\w+)\}/g, (_, k: string) =>
        params[k] != null ? String(params[k]) : `{${k}}`,
      )
    : key;

const P = 'notifications.types';

describe('notificationContent', () => {
  it('даёт непустой заголовок и тело для нового сообщения в чате', () => {
    const { title, body } = notificationContent(
      'NEW_CHAT_MESSAGE',
      { thread_id: 't1', listing_id: 'l1', message_id: 'm1', sender_id: 's1' },
      t,
    );
    expect(title).toBe(`${P}.NEW_CHAT_MESSAGE.title`);
    expect(body).toBe(`${P}.NEW_CHAT_MESSAGE.body`);
    // Главное — НЕ пусто (исходный баг: title/body были пустыми).
    expect(title).not.toBe('');
    expect(body).not.toBe('');
  });

  it('подставляет имя сохранённого поиска в тело', () => {
    const { body } = notificationContent(
      'SAVED_SEARCH_NEW_LISTING',
      { saved_search_name: 'Юнусабад 2к', listing_id: 'l1' },
      t,
    );
    expect(body).toBe('notifications.types.SAVED_SEARCH_NEW_LISTING.body');
    // Имя должно прокинуться (стаб подставит {name}); проверяем через интерполяцию.
    const interpolated = notificationContent(
      'SAVED_SEARCH_NEW_LISTING',
      { saved_search_name: 'Юнусабад 2к' },
      (k, params) =>
        params?.name != null ? `body:${String(params.name)}` : k,
    );
    expect(interpolated.body).toBe('body:Юнусабад 2к');
  });

  it('без имени поиска использует ключ body_noname', () => {
    const { body } = notificationContent('SAVED_SEARCH_NEW_LISTING', {}, t);
    expect(body).toBe(`${P}.SAVED_SEARCH_NEW_LISTING.body_noname`);
  });

  it('модерация: статус ACTIVE → ключ body_ACTIVE', () => {
    const { body } = notificationContent(
      'LISTING_MODERATION_STATUS_CHANGED',
      { new_status: 'ACTIVE', moderation_action: 'APPROVE' },
      t,
    );
    expect(body).toBe(`${P}.LISTING_MODERATION_STATUS_CHANGED.body_ACTIVE`);
  });

  it('модерация: REJECTED c причиной → ключ body_REJECTED_reason + прокинут reason', () => {
    const { body } = notificationContent(
      'LISTING_MODERATION_STATUS_CHANGED',
      { new_status: 'REJECTED', reason: 'Нет фото' },
      t,
    );
    expect(body).toBe(`${P}.LISTING_MODERATION_STATUS_CHANGED.body_REJECTED_reason`);
    // Причина должна прокинуться в перевод как {reason}.
    const echoed = notificationContent(
      'LISTING_MODERATION_STATUS_CHANGED',
      { new_status: 'REJECTED', reason: 'Нет фото' },
      (k, params) =>
        params?.reason != null ? `reason:${String(params.reason)}` : k,
    );
    expect(echoed.body).toBe('reason:Нет фото');
  });

  it('модерация: REJECTED без причины → ключ без reason', () => {
    const { body } = notificationContent(
      'LISTING_MODERATION_STATUS_CHANGED',
      { new_status: 'REJECTED' },
      t,
    );
    expect(body).toBe(`${P}.LISTING_MODERATION_STATUS_CHANGED.body_REJECTED`);
  });

  it('заявка агента: APPROVED → ключ body_APPROVED + deep link на /become-agent', () => {
    const { title, body, href } = notificationContent(
      'AGENT_APPLICATION_RESOLVED',
      { application_id: 'a1', status: 'APPROVED', reject_reason: null },
      t,
    );
    expect(title).toBe('notifications.agentApplication.title');
    expect(body).toBe('notifications.agentApplication.body_APPROVED');
    expect(href).toBe('/become-agent');
  });

  it('заявка агента: REJECTED c причиной → ключ body_REJECTED_reason + прокинут reason', () => {
    const { body, href } = notificationContent(
      'AGENT_APPLICATION_RESOLVED',
      { application_id: 'a1', status: 'REJECTED', reject_reason: 'Мало опыта' },
      t,
    );
    expect(body).toBe('notifications.agentApplication.body_REJECTED_reason');
    expect(href).toBe('/become-agent');
    // Причина должна прокинуться в перевод как {reason}.
    const echoed = notificationContent(
      'AGENT_APPLICATION_RESOLVED',
      { application_id: 'a1', status: 'REJECTED', reject_reason: 'Мало опыта' },
      (k, params) =>
        params?.reason != null ? `reason:${String(params.reason)}` : k,
    );
    expect(echoed.body).toBe('reason:Мало опыта');
  });

  it('заявка агента: REJECTED без причины → ключ без reason', () => {
    const { body } = notificationContent(
      'AGENT_APPLICATION_RESOLVED',
      { application_id: 'a1', status: 'REJECTED', reject_reason: null },
      t,
    );
    expect(body).toBe('notifications.agentApplication.body_REJECTED');
  });

  it('неизвестный тип → generic-фолбэк, но не пусто', () => {
    const { title, body } = notificationContent(
      'SOMETHING_NEW' as never,
      null,
      t,
    );
    expect(title).toBe(`${P}.generic.title`);
    expect(body).toBe(`${P}.generic.body`);
  });
});
