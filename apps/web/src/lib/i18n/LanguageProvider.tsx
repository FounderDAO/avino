"use client";

/**
 * i18n админ-панели (ADMIN-17) — провайдер языка интерфейса.
 *
 * Клиентский контекст: текущая локаль + сеттер + `t`. Локаль гидрируется из
 * localStorage ПОСЛЕ монтирования (на сервере и при первом клиентском рендере —
 * DEFAULT_LOCALE), чтобы не было hydration mismatch: `<html lang>` на сервере уже
 * `ru`. Выбор пользователя пишется в localStorage и в `document.documentElement.lang`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isLocale,
  type Locale,
} from './config';
import { translate, type TVars } from './t';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: TVars) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Гидрация выбранного языка после монтирования (избегаем SSR mismatch).
  useEffect(() => {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved) && saved !== DEFAULT_LOCALE) {
      setLocaleState(saved);
    }
  }, []);

  // Держим <html lang> в синхроне с выбранной локалью.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // localStorage недоступен (приватный режим) — переключение в рамках сессии.
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: TVars) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/** Хук доступа к i18n: `{ t, locale, setLocale }`. Только внутри LanguageProvider. */
export function useT(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useT must be used within <LanguageProvider>');
  }
  return ctx;
}
