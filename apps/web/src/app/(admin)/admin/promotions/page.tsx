"use client";

import { useT } from "@/lib/i18n";
import { PromotionPlansTable } from "@/components/admin/PromotionPlansTable";
import { PromotionSettingsCard } from "@/components/admin/PromotionSettingsCard";

/**
 * Task 7 — страница тарифов и продвижения (`/admin/promotions`, API.md §15).
 *
 * Правка 6 тарифов VIP/TOP (цена + активность) и интервала проверки истечения
 * промо. Данные только через RTK Query (CLAUDE.md §4); доступ — ADMIN.
 * Локализовано RU/UZ/EN.
 */
export default function AdminPromotionsPage() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
          {t("promotions.tariffs.title")}
        </h1>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          {t("promotions.tariffs.subtitle")}
        </p>
      </div>
      <PromotionPlansTable />
      <PromotionSettingsCard />
    </div>
  );
}
