import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Avino — админка",
  description: "Панель администратора Avino",
};

// Заглушка дашборда. Живые счётчики появятся в ADMIN-15.
export default function AdminDashboardPage() {
  const cards = [
    { label: "Объявления на модерации", hint: "NEW" },
    { label: "Новые жалобы", hint: "NEW" },
    { label: "Пользователи", hint: "всего" },
    { label: "Активные промо", hint: "VIP / TOP" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-sm font-bold text-gray-900 dark:text-white">
          Дашборд
        </h1>
        <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
          Оболочка админки готова. Разделы наполняются в следующих задачах
          (ADMIN-03 и далее).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">
              {card.label}
            </p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-title-sm font-bold text-gray-800 dark:text-white/90">
                —
              </span>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-theme-xs font-medium text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400">
                {card.hint}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
