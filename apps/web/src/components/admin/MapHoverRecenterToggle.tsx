/**
 * Runtime-переключатель «Центрирование карты при наведении на карточку» (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 * Выкл (default) → карта стоит на месте при наведении (Zillow-режим);
 * вкл → карта центрируется к объекту. Зеркалит PromotionsAvailabilityToggle.
 */
'use client';

import {
  useGetMapHoverRecenterFlagQuery,
  useUpdateMapHoverRecenterFlagMutation,
} from '@/store/api/adminMapHoverRecenterFlagApi';
import { Switch } from '@/components/admin/ui/switch';

export function MapHoverRecenterToggle() {
  const { data, isLoading } = useGetMapHoverRecenterFlagQuery();
  const [update, { isLoading: isSaving }] =
    useUpdateMapHoverRecenterFlagMutation();
  const enabled = data?.mapHoverRecenter ?? false;

  return (
    <div className="a-card" style={{ padding: 24 }}>
      <div
        className="row gap-16"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            Центрирование карты при наведении на карточку
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            По умолчанию выключено — карта стоит на месте при наведении на
            карточку (как Zillow). Включить → карта центрируется к объекту.
            Подсветка пина работает всегда. Без пересборки.
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={isLoading || isSaving}
          onChange={() => void update({ enabled: !enabled })}
          label="Центрирование карты при наведении на карточку"
        />
      </div>
    </div>
  );
}
