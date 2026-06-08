"use client";

import {
  useGetPromotionSettingsQuery,
  useUpdatePromotionSettingsMutation,
} from "@/store/api/adminPromotionsApi";
import { useToast } from "@/components/admin/toast/ToastProvider";
import { useT } from "@/lib/i18n";

/**
 * Task 7 — выбор интервала проверки истечения промо (`/admin/promotion-settings`).
 *
 * Фоновая задача проверяет истёкшие VIP/TOP каждые 6 или 12 часов. Текущее
 * значение приходит из `GET`, смена — через `PATCH`. Данные только через RTK
 * Query (CLAUDE.md §4). i18n RU/UZ/EN.
 */

const INTERVALS: { value: 6 | 12; labelKey: string }[] = [
  { value: 6, labelKey: "promotions.tariffs.every6h" },
  { value: 12, labelKey: "promotions.tariffs.every12h" },
];

export function PromotionSettingsCard() {
  const { t } = useT();
  const toast = useToast();
  const { data, isLoading, isError } = useGetPromotionSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] =
    useUpdatePromotionSettingsMutation();

  const current = data?.expiryIntervalHours;

  async function handleSelect(value: 6 | 12) {
    if (value === current) return;
    try {
      await updateSettings({ expiryIntervalHours: value }).unwrap();
      toast.success(t("promotions.tariffs.saved"));
    } catch {
      toast.error(t("promotions.tariffs.saveError"));
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
        {t("promotions.tariffs.settingsTitle")}
      </h2>
      <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">
        {t("promotions.tariffs.settingsHint")}
      </p>

      {isError ? (
        <p className="mt-4 text-theme-sm text-error-500">
          {t("promotions.tariffs.loadError")}
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {INTERVALS.map(({ value, labelKey }) => {
            const selected = current === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => handleSelect(value)}
                disabled={isLoading || isSaving}
                className={`rounded-lg border px-4 py-2 text-theme-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                }`}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
