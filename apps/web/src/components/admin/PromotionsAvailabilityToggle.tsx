/**
 * Runtime-переключатель раздела «Продвижение объявлений» (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 * Выключение → функционал продвижения скрыт из публичного портала.
 * Зеркалит SmsSendingToggle.
 */
'use client';

import {
  useGetPromotionsFlagQuery,
  useUpdatePromotionsFlagMutation,
} from '@/store/api/adminPromotionsFlagApi';
import { Switch } from '@/components/admin/ui/switch';

export function PromotionsAvailabilityToggle() {
  const { data, isLoading } = useGetPromotionsFlagQuery();
  const [update, { isLoading: isSaving }] = useUpdatePromotionsFlagMutation();
  const enabled = data?.promotionsEnabled ?? false;

  return (
    <div className="a-card" style={{ padding: 24 }}>
      <div
        className="row gap-16"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            Продвижение объявлений
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Раздел платного продвижения (тарифы, размещение в топе, баннеры).
            Выключение → функционал скрыт из портала и API. Без пересборки.
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={isLoading || isSaving}
          onChange={() => void update({ enabled: !enabled })}
          label="Продвижение объявлений"
        />
      </div>
    </div>
  );
}
