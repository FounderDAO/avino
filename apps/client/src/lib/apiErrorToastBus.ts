/**
 * Модульный event-bus между Redux-middleware и React-миром для toast-ошибок.
 *
 * Middleware (`store/apiErrorToastMiddleware.ts`) живёт вне React и не может
 * переводить сообщения — он лишь эмитит событие сюда. Компонент
 * `ApiErrorToasts` подписывается, маппит ошибку на i18n-текст и показывает
 * `toast.error(...)`.
 */

export interface ApiErrorEvent {
  /** Имя эндпоинта RTK Query, чья мутация упала. */
  endpointName: string;
  /** Payload rejected-экшена (FetchBaseQueryError). */
  error: unknown;
}

type Listener = (event: ApiErrorEvent) => void;

const listeners = new Set<Listener>();

export function emitApiError(event: ApiErrorEvent): void {
  listeners.forEach((listener) => listener(event));
}

/** Подписка на ошибки API; возвращает функцию отписки. */
export function subscribeApiErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
