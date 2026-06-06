"use client";

import { useState } from "react";

import { LOG_TAB_KEYS } from "@/lib/logs";
import type { LogTab } from "@/lib/logs";
import { useT } from "@/lib/i18n";
import { AuditLogsTab } from "@/components/admin/logs/AuditLogsTab";
import { ModerationLogsTab } from "@/components/admin/logs/ModerationLogsTab";
import { PromotionLogsTab } from "@/components/admin/logs/PromotionLogsTab";
import { NotificationLogsTab } from "@/components/admin/logs/NotificationLogsTab";

/**
 * ADMIN-14 — журналы (`/admin/logs`, API.md §16).
 *
 * Четыре read-only журнала под одной страницей с переключателем вкладок: аудит,
 * модерация, промо, уведомления. Рендерится только активная вкладка — так в
 * каждый момент работает один RTK-запрос (а не четыре сразу); при возврате на
 * вкладку RTK Query отдаёт данные из кэша. Каждая вкладка держит свои фильтры,
 * пагинацию и колонки (см. `components/admin/logs/*`). Данные — только через RTK
 * Query (CLAUDE.md §4), доступ на бэкенде — ADMIN. Локализовано (ADMIN-17).
 */
export default function AdminLogsPage() {
  const { t } = useT();
  const [tab, setTab] = useState<LogTab>("audit");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
          {t("logs.title")}
        </h1>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("logs.subtitle")}
        </p>
      </div>

      {/* Переключатель вкладок */}
      <div className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-800">
        {LOG_TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-theme-sm font-medium transition ${
              tab === key
                ? "border-brand-500 text-brand-500"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {t(`logs.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === "audit" && <AuditLogsTab />}
      {tab === "moderation" && <ModerationLogsTab />}
      {tab === "promotion" && <PromotionLogsTab />}
      {tab === "notification" && <NotificationLogsTab />}
    </div>
  );
}
