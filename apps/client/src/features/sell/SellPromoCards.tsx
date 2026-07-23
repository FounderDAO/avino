/**
 * SellPromoCards — карточки тарифов TOP/VIP на лендинге «Продать».
 *
 * Цены живые: GET /promotions/plans (публичная ручка, цены редактирует админ).
 * Для каждого типа показываем минимальную цену среди активных планов
 * («от 50,000 сум»). Пока данных нет (загрузка/ошибка/пустой каталог) —
 * статичный фолбэк из словаря `sell.promo.{tier}.price`.
 */
'use client';

import { useTranslations } from 'next-intl';
import { formatMoney } from '@/lib/format';
import { useGetPromotionPlansQuery, type PromotionPlan } from '@/store/api/promotionsApi';

/** Тарифы продвижения (NORMAL — бесплатно, TOP/VIP — платные). */
const PROMOS: { tier: 'TOP' | 'VIP'; key: 'top' | 'vip'; color: string }[] = [
  { tier: 'TOP', key: 'top', color: 'text-[#ff9ca0]' },
  { tier: 'VIP', key: 'vip', color: 'text-[#E8C07A]' },
];

/** Самый дешёвый план типа (среди периодов 7/14/30 дней) или null. */
function cheapestPlan(plans: PromotionPlan[] | undefined, type: 'TOP' | 'VIP'): PromotionPlan | null {
  const own = (plans ?? []).filter((p) => p.type === type && Number.isFinite(Number(p.price)));
  if (own.length === 0) return null;
  return own.reduce((min, p) => (Number(p.price) < Number(min.price) ? p : min));
}

export function SellPromoCards() {
  const t = useTranslations('sell');
  const tUnits = useTranslations('units');
  const { data: plans } = useGetPromotionPlansQuery();

  return (
    <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
      {PROMOS.map((p) => {
        const plan = cheapestPlan(plans, p.tier);
        const price = plan
          ? t('promo.priceFrom', { price: formatMoney(Number(plan.price), plan.currency, tUnits) })
          : t(`promo.${p.key}.price`);
        return (
          <div
            key={p.tier}
            className="rounded-[16px] border border-white/10 bg-white/[0.06] px-6 py-[22px]"
          >
            <div className="flex items-center justify-between">
              <span className={'text-[22px] font-extrabold ' + p.color}>{p.tier}</span>
              <span className="text-base font-bold">{price}</span>
            </div>
            <p className="mt-2.5 text-[14.5px] text-white/70">{t(`promo.${p.key}.text`)}</p>
          </div>
        );
      })}
    </div>
  );
}
