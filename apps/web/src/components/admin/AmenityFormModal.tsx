/**
 * Модалка справочника удобств: создание и переименование (API.md §22).
 * Вёрстка/поведение зеркалят CreateUserModal (fade-up a-card, клик по фону
 * закрывает, поля a-field). Мутации create/update держатся внутри модалки,
 * чтобы при ошибке (`AMENITY_CODE_TAKEN`/`VALIDATION_ERROR`) показать сообщение
 * и не закрывать форму.
 *
 * Режимы:
 * - create (`amenity == null`): вводятся 3 лейбла + опциональный `code`
 *   (пусто → бэкенд сгенерирует слаг из label_en) + порядок + видимость.
 * - edit  (`amenity != null`):  `code` неизменяем (показан read-only), правятся
 *   лейблы/порядок/видимость.
 */
'use client';

import { useState } from 'react';
import { IC } from '@/components/admin/icons';
import { Switch } from '@/components/admin/ui/switch';
import { useToast } from '@/components/admin/toast';
import {
  useCreateAmenityMutation,
  useUpdateAmenityMutation,
  type Amenity,
} from '@/store/api/adminAmenitiesApi';
import { getApiErrorCode } from '@/store/api/apiError';

interface AmenityFormModalProps {
  /** null/undefined — режим создания; объект — режим правки. */
  amenity?: Amenity | null;
  onClose: () => void;
}

/** Человекочитаемый текст по стабильному коду ошибки API. */
function messageFor(code: string | null): string {
  if (code === 'AMENITY_CODE_TAKEN')
    return 'Код уже занят. Укажите другой или очистите поле — код сгенерируется из английского названия.';
  if (code === 'VALIDATION_ERROR') return 'Проверьте правильность заполнения полей.';
  return 'Не удалось сохранить. Попробуйте ещё раз.';
}

const labelStyle = { fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 6 } as const;

export function AmenityFormModal({ amenity, onClose }: AmenityFormModalProps) {
  const isEdit = Boolean(amenity);
  const showToast = useToast();

  const [labelRu, setLabelRu] = useState(amenity?.label_ru ?? '');
  const [labelUz, setLabelUz] = useState(amenity?.label_uz ?? '');
  const [labelEn, setLabelEn] = useState(amenity?.label_en ?? '');
  const [code, setCode] = useState(''); // только create; на edit code неизменяем
  const [sortOrder, setSortOrder] = useState(String(amenity?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(amenity?.is_active ?? true);
  const [err, setErr] = useState<string | null>(null);

  const [createAmenity, { isLoading: creating }] = useCreateAmenityMutation();
  const [updateAmenity, { isLoading: updating }] = useUpdateAmenityMutation();
  const saving = creating || updating;

  // Валидность: три лейбла непустые + порядок — целое ≥ 0.
  const parsedOrder = Number(sortOrder.trim());
  const orderValid = sortOrder.trim() !== '' && Number.isInteger(parsedOrder) && parsedOrder >= 0;
  const valid =
    labelRu.trim() !== '' && labelUz.trim() !== '' && labelEn.trim() !== '' && orderValid;

  async function onSubmit() {
    if (!valid || saving) return;
    setErr(null);
    try {
      if (isEdit && amenity) {
        await updateAmenity({
          id: amenity.id,
          label_ru: labelRu.trim(),
          label_uz: labelUz.trim(),
          label_en: labelEn.trim(),
          sort_order: parsedOrder,
          is_active: isActive,
        }).unwrap();
        showToast('Удобство обновлено');
      } else {
        await createAmenity({
          label_ru: labelRu.trim(),
          label_uz: labelUz.trim(),
          label_en: labelEn.trim(),
          code: code.trim() || undefined,
          sort_order: parsedOrder,
          is_active: isActive,
        }).unwrap();
        showToast('Удобство создано');
      }
      onClose();
    } catch (e) {
      setErr(messageFor(getApiErrorCode(e as never)));
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(26,26,26,.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fade-up a-card"
        style={{ width: '100%', maxWidth: 480, padding: 26, borderRadius: 16 }}
      >
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 22 }}>{isEdit ? 'Редактировать удобство' : 'Новое удобство'}</h2>
          <button
            className="aicon-btn"
            style={{ width: 32, height: 32, border: 'none' }}
            onClick={onClose}
          >
            <IC.X size={18} />
          </button>
        </div>

        <div className="col gap-14">
          <div>
            <label style={labelStyle}>Название (RU) *</label>
            <input
              className="a-field"
              style={{ width: '100%' }}
              placeholder="Парковка"
              value={labelRu}
              onChange={(e) => setLabelRu(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Название (UZ) *</label>
            <input
              className="a-field"
              style={{ width: '100%' }}
              placeholder="Avtoturargoh"
              value={labelUz}
              onChange={(e) => setLabelUz(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Название (EN) *</label>
            <input
              className="a-field"
              style={{ width: '100%' }}
              placeholder="Parking"
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
            />
          </div>

          {/* Код: на create — редактируемый (опционально), на edit — read-only (неизменяем). */}
          <div>
            <label style={labelStyle}>Код</label>
            {isEdit ? (
              <div
                className="a-field"
                style={{
                  width: '100%',
                  color: 'var(--muted)',
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {amenity?.code}
              </div>
            ) : (
              <input
                className="a-field"
                style={{ width: '100%', fontFamily: 'monospace' }}
                placeholder="PARKING (необязательно)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            )}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>
              {isEdit
                ? 'Код неизменяем.'
                : 'Оставьте пустым — сгенерируется из английского названия. Вручную: только A–Z, 0–9, «_», начинается с буквы.'}
            </div>
          </div>

          <div className="row gap-12" style={{ alignItems: 'flex-end' }}>
            <div style={{ width: 120 }}>
              <label style={labelStyle}>Порядок</label>
              <input
                className="a-field"
                style={{ width: '100%' }}
                inputMode="numeric"
                placeholder="0"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="row gap-8" style={{ alignItems: 'center', paddingBottom: 10 }}>
              <Switch
                checked={isActive}
                onChange={() => setIsActive((v) => !v)}
                label="Показывать удобство"
              />
              <span style={{ fontSize: 13.5 }}>{isActive ? 'Активно' : 'Скрыто'}</span>
            </div>
          </div>

          {err && (
            <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>{err}</div>
          )}

          <div className="row gap-10" style={{ marginTop: 6 }}>
            <button
              className="abtn abtn-primary"
              style={{ flex: 1, opacity: valid && !saving ? 1 : 0.5 }}
              disabled={!valid || saving}
              onClick={onSubmit}
            >
              {saving ? '…' : isEdit ? 'Сохранить' : 'Создать'}
            </button>
            <button className="abtn abtn-outline" onClick={onClose} disabled={saving}>
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
