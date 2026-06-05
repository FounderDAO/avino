"use client";

import { useEffect, useRef, useState } from "react";

import { useGetMeQuery, type MeResponse } from "@/store/api/authApi";
import { useLogout } from "@/hooks/useLogout";

/**
 * UserMenu (ADMIN-06) — заменяет статичную заглушку «AD / Администратор» в шапке.
 * Показывает реального пользователя из `GET /auth/me` (уже в кэше после гарда) и
 * даёт выход (`useLogout`: POST /auth/logout + очистка токенов + редирект).
 *
 * Рендерится только внутри защищённой оболочки (RoleGuard уже пропустил ADMIN),
 * поэтому `me` здесь практически всегда есть; на всякий случай — безопасные
 * фоллбэки имени и инициалов.
 */

function displayName(me?: MeResponse): string {
  if (!me) return "Администратор";
  const p = me.profile;
  if (p?.display_name) return p.display_name;
  const full = [p?.first_name, p?.last_name].filter(Boolean).join(" ");
  if (full) return full;
  return me.email ?? me.phone ?? "Администратор";
}

function initialsFrom(me?: MeResponse): string {
  const name = displayName(me);
  const parts = name.trim().split(/\s+/);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || "AD").toUpperCase();
}

export function UserMenu() {
  const { data: me } = useGetMeQuery();
  const logout = useLogout();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Закрытие по клику вне меню и по Escape.
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

  const name = displayName(me);
  const subtitle = me?.email ?? me?.phone ?? "Avino";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Меню пользователя"
        className="flex cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1 transition hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400">
          {initialsFrom(me)}
        </span>
        <span className="hidden text-left lg:block">
          <span className="block max-w-[160px] truncate text-theme-sm font-medium text-gray-700 dark:text-gray-300">
            {name}
          </span>
          <span className="block max-w-[160px] truncate text-theme-xs text-gray-500 dark:text-gray-400">
            {subtitle}
          </span>
        </span>
        <svg
          className={`hidden text-gray-500 transition-transform duration-200 lg:block dark:text-gray-400 ${
            open ? "rotate-180" : ""
          }`}
          width="18"
          height="18"
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
          aria-label="Действия пользователя"
          className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">
              {name}
            </p>
            <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-theme-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <path
                d="M15 17v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1M10 12h11m0 0-3-3m3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}
