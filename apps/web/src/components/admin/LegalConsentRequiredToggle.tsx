/**
 * Runtime-управление согласием с Правилами и Политикой (ADMIN).
 * Client-island: тоггл «Требовать согласие» + поле «Текущая версия документов».
 * Без пересборки (PATCH /admin/legal-consent-flag). Дефолт — выключено (fail-safe).
 * Тоггл зеркалит PromotionsAvailabilityToggle; ввод версии — ExchangeRatePanel.
 */
'use client';

import { useState } from 'react';
import {
  useGetLegalConsentFlagQuery,
  useUpdateLegalConsentFlagMutation,
} from '@/store/api/adminLegalConsentFlagApi';
import { Switch } from '@/components/admin/ui/switch';

export function LegalConsentRequiredToggle() {
  const { data, isLoading } = useGetLegalConsentFlagQuery();
  const [update, { isLoading: isSaving }] =
    useUpdateLegalConsentFlagMutation();
  const required = data?.legalConsentRequired ?? false;
  const version = data?.legalConsentVersion ?? 1;
  const [draft, setDraft] = useState('');

  const parsed = Number(draft);
  const versionValid =
    draft.trim() !== '' && Number.isInteger(parsed) && parsed >= 1;

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div
        className="row gap-16"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            Требовать согласие с Правилами и Политикой
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            При входе пользователь должен принять Правила и Политику конфиденциальности.
            По умолчанию выключено. Без пересборки.
          </div>
        </div>
        <Switch
          checked={required}
          disabled={isLoading || isSaving}
          onChange={() => void update({ required: !required })}
          label="Требовать согласие с Правилами и Политикой"
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>
          Текущая версия документов
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Текущая версия: {isLoading ? '…' : version}. Подняли тексты Правил или
          Политики → поднимите версию: пользователи согласятся заново.
        </div>
        <div className="row gap-16" style={{ marginTop: 12, alignItems: 'center' }}>
          <input
            className="a-field"
            inputMode="numeric"
            placeholder={`Напр. ${version + 1}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="button"
            className="abtn abtn-primary"
            disabled={isSaving || !versionValid}
            onClick={async () => {
              await update({ version: parsed });
              setDraft('');
            }}
          >
            {isSaving ? '…' : 'Сохранить версию'}
          </button>
        </div>
      </div>
    </div>
  );
}
