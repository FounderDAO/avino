/**
 * Управление зоной на карте — как в мобильном приложении (map_search_screen.dart):
 *  - слева внизу круглые кнопки: «Нарисовать зону» (всегда) и, когда зона есть, «Сбросить область»;
 *  - пока рисуем: подсказка сверху по центру и круглая «Отмена» справа внизу.
 * Кладётся внутрь relative-контейнера карты.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Signature, X } from 'lucide-react';

export interface ZoneDrawControlsProps {
  drawing: boolean;
  hasZone: boolean;
  onStart: () => void;
  onCancel: () => void;
  onReset: () => void;
}

/** Над логотипом Яндекса; на телефоне — ещё и над переключателем «Список / Карта». */
const BOTTOM = 'bottom-[84px] lg:bottom-[44px]';

function MapFab({
  label,
  onClick,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-surface text-ink shadow-[0_3px_10px_rgba(0,0,0,0.2)] transition-transform hover:scale-105 active:scale-95"
    >
      {children}
    </button>
  );
}

export function ZoneDrawControls({
  drawing,
  hasZone,
  onStart,
  onCancel,
  onReset,
}: ZoneDrawControlsProps) {
  const t = useTranslations('search');
  return (
    <>
      {drawing && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-[1000] flex justify-center px-4">
          <span className="rounded-pill bg-surface px-4 py-2 text-sm text-ink shadow-[0_3px_10px_rgba(0,0,0,0.2)]">
            {t('map.drawHint')}
          </span>
        </div>
      )}

      <div className={`absolute left-4 z-[1000] flex gap-[11px] ${BOTTOM}`}>
        <MapFab label={t('map.drawTerritory')} onClick={onStart} testId="zone-draw-start">
          <Signature size={22} strokeWidth={2} />
        </MapFab>
        {hasZone && !drawing && (
          <MapFab label={t('map.clear')} onClick={onReset} testId="zone-reset">
            <X size={22} strokeWidth={2.2} />
          </MapFab>
        )}
      </div>

      {drawing && (
        <div className={`absolute right-4 z-[1000] ${BOTTOM}`}>
          <MapFab label={t('map.cancel')} onClick={onCancel} testId="zone-draw-cancel">
            <X size={22} strokeWidth={2.2} />
          </MapFab>
        </div>
      )}
    </>
  );
}
