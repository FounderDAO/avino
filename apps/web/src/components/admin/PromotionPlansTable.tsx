"use client";

import { useEffect, useState } from "react";

import {
  useGetPromotionPlansQuery,
  useUpdatePromotionPlanMutation,
} from "@/store/api/adminPromotionsApi";
import type { AdminPromotionPlan } from "@/store/api/adminTypes";
import { useToast } from "@/components/admin/toast/ToastProvider";
import { useT } from "@/lib/i18n";

/**
 * Task 7 — редактируемая таблица тарифов VIP/TOP (`/admin/promotion-plans`).
 *
 * Шесть тарифов (TOP/VIP × 7/14/30) с правкой цены (decimal-строка, ADR-002) и
 * переключателем активности. Локальное состояние строк сеется из данных запроса;
 * каждая строка сохраняется отдельно через `PATCH /admin/promotion-plans/:id`.
 * Данные — только через RTK Query (CLAUDE.md §4). i18n RU/UZ/EN.
 */

/** Локальное редактируемое состояние строки тарифа. */
type RowDraft = { price: string; isActive: boolean };

export function PromotionPlansTable() {
  const { t } = useT();
  const toast = useToast();
  const { data, isLoading, isError } = useGetPromotionPlansQuery();
  const [updatePlan] = useUpdatePromotionPlanMutation();

  // Черновики строк, ключ — id тарифа. Пересеваем при каждом приходе данных.
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  // id тарифа, по которому сейчас идёт мутация (для дизейбла кнопки строки).
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setDrafts(
      Object.fromEntries(
        data.map((plan) => [
          plan.id,
          { price: plan.price, isActive: plan.isActive },
        ]),
      ),
    );
  }, [data]);

  async function handleSave(plan: AdminPromotionPlan) {
    const draft = drafts[plan.id];
    if (!draft) return;
    setSavingId(plan.id);
    try {
      await updatePlan({
        id: plan.id,
        body: { price: draft.price, isActive: draft.isActive },
      }).unwrap();
      toast.success(t("promotions.tariffs.saved"));
    } catch {
      toast.error(t("promotions.tariffs.saveError"));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-4 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
        {t("promotions.tariffs.tableTitle")}
      </h2>

      {isError ? (
        <p className="text-theme-sm text-error-500">
          {t("promotions.tariffs.loadError")}
        </p>
      ) : isLoading ? (
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          {t("common.updating")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-theme-sm">
            <thead>
              <tr className="border-b border-gray-200 text-theme-xs font-medium uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="py-3 pr-4">{t("promotions.tariffs.tier")}</th>
                <th className="py-3 pr-4">{t("promotions.tariffs.period")}</th>
                <th className="py-3 pr-4">{t("promotions.tariffs.price")}</th>
                <th className="py-3 pr-4 text-center">
                  {t("promotions.tariffs.active")}
                </th>
                <th className="py-3 pl-4 text-right" />
              </tr>
            </thead>
            <tbody>
              {data?.map((plan) => {
                const draft = drafts[plan.id] ?? {
                  price: plan.price,
                  isActive: plan.isActive,
                };
                const saving = savingId === plan.id;
                return (
                  <tr
                    key={plan.id}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                  >
                    <td className="py-3 pr-4 font-medium text-gray-800 dark:text-white/90">
                      {plan.type}
                    </td>
                    <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">
                      {t("promotions.tariffs.periodDaysFmt", {
                        n: plan.period_days,
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draft.price}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [plan.id]: { ...draft, price: e.target.value },
                            }))
                          }
                          className="w-32 rounded-lg border border-gray-300 bg-transparent px-3 py-1.5 text-theme-sm text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white"
                        />
                        <span className="text-theme-xs text-gray-400">
                          {plan.currency}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [plan.id]: {
                              ...draft,
                              isActive: e.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-brand-500 focus:ring-brand-500/20 dark:border-gray-700"
                      />
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleSave(plan)}
                        disabled={saving}
                        className="rounded-lg bg-brand-500 px-4 py-1.5 text-theme-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-500/40"
                      >
                        {saving
                          ? t("promotions.tariffs.saving")
                          : t("promotions.tariffs.save")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
