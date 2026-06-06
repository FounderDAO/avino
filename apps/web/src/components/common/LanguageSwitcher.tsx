"use client";

/**
 * LanguageSwitcher (ADMIN-17) — переключатель языка интерфейса админки.
 *
 * Триггер показывает глобус + флаг и название текущего языка; дропдаун — список
 * локалей (флаг + родное название), активная подсвечена брендовым цветом.
 * Поведение закрытия (клик вне / Escape) и стили — в духе UserMenu/ThemeToggle
 * (TailAdmin). Выбор сохраняется в localStorage через LanguageProvider.
 */

import { useEffect, useRef, useState } from "react";

import { LOCALES, LOCALE_META, useT, type Locale } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(next: Locale) {
    setLocale(next);
    setOpen(false);
  }

  const current = LOCALE_META[locale];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("header.changeLanguage")}
        className="flex h-11 cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-theme-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className="text-gray-400 dark:text-gray-500"
          aria-hidden
        >
          <path
            d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.5 3.75-5.5 3.75-9S14.5 5.5 12 3M12 21c-2.5-2.5-3.75-5.5-3.75-9S9.5 5.5 12 3M3.5 9h17M3.5 15h17"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span aria-hidden className="text-base leading-none">
          {current.flag}
        </span>
        <span className="hidden sm:block">{current.native}</span>
        <svg
          className={`hidden text-gray-400 transition-transform duration-200 sm:block dark:text-gray-500 ${
            open ? "rotate-180" : ""
          }`}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("header.changeLanguage")}
          className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
        >
          {LOCALES.map((code) => {
            const meta = LOCALE_META[code];
            const active = code === locale;
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(code)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-theme-sm font-medium transition ${
                  active
                    ? "bg-brand-50 text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {meta.flag}
                </span>
                {meta.native}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
