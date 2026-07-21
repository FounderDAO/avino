/**
 * Справочник удобств — CRUD-экран (ADR-0111, API.md §22).
 * Позволяет админу менять список удобств без релиза: создать, переименовать
 * (RU/UZ/EN), задать порядок, скрыть/показать (`is_active`). Раньше это было
 * доступно только через curl.
 *
 * Данные — GET /admin/amenities (полный список, активные + скрытые, без
 * пагинации; сортировка приходит с бэка: sort_order asc, code asc). Создание/
 * правка — через AmenityFormModal. Видимость переключается инлайн-тумблером в
 * строке (мгновенный PATCH). Вёрстка повторяет broadcasts/users: a-card,
 * a-table, abtn.
 */
'use client';

import { useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { IC } from '@/components/admin/icons';
import { Switch } from '@/components/admin/ui/switch';
import { useToast } from '@/components/admin/toast';
import { AmenityFormModal } from '@/components/admin/AmenityFormModal';
import {
  useListAmenitiesQuery,
  useUpdateAmenityMutation,
  type Amenity,
} from '@/store/api/adminAmenitiesApi';

/** Состояние модалки: закрыта | создание | правка конкретного удобства. */
type ModalState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; amenity: Amenity };

export default function AmenitiesPage() {
  const showToast = useToast();
  const { data, isLoading, isFetching, isError, refetch } = useListAmenitiesQuery();
  const [toggle] = useUpdateAmenityMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ mode: 'closed' });

  const rows = data ?? [];
  const total = rows.length;
  const activeCount = rows.filter((a) => a.is_active).length;

  async function onToggle(a: Amenity) {
    setBusyId(a.id);
    try {
      await toggle({ id: a.id, is_active: !a.is_active }).unwrap();
      showToast(a.is_active ? 'Удобство скрыто' : 'Удобство показано');
    } catch {
      showToast('Не удалось изменить видимость');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* ── Заголовок ───────────────────────────────────────────────────────── */}
      <div
        className="row"
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <SectionTitle sub={`${total} удобств · ${activeCount} активных`}>Удобства</SectionTitle>
        <button
          className="abtn abtn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => setModal({ mode: 'create' })}
        >
          <IC.Plus size={17} /> Новое удобство
        </button>
      </div>

      {/* ── Таблица ─────────────────────────────────────────────────────────── */}
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить справочник.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : (
        <div className="a-card table-scroll">
          <table className="a-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Порядок</th>
                <th>Код</th>
                <th>RU</th>
                <th>UZ</th>
                <th>EN</th>
                <th style={{ width: 130 }}>Видимость</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                    Загрузка…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                    Справочник пуст. Добавьте первое удобство.
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} style={{ opacity: a.is_active ? 1 : 0.55 }}>
                    <td
                      className="muted"
                      style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}
                    >
                      {a.sort_order}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.code}</td>
                    <td style={{ fontWeight: 600 }}>{a.label_ru}</td>
                    <td className="muted">{a.label_uz}</td>
                    <td className="muted">{a.label_en}</td>
                    <td>
                      <div className="row gap-8" style={{ alignItems: 'center' }}>
                        <Switch
                          checked={a.is_active}
                          onChange={() => onToggle(a)}
                          disabled={busyId === a.id}
                          label={`Видимость: ${a.label_ru}`}
                        />
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                          {a.is_active ? 'Активно' : 'Скрыто'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        className="aicon-btn"
                        style={{ width: 32, height: 32 }}
                        title="Редактировать"
                        aria-label={`Редактировать ${a.label_ru}`}
                        onClick={() => setModal({ mode: 'edit', amenity: a })}
                      >
                        <IC.Edit size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Статус-строка ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
        {isFetching ? 'Обновление…' : total === 0 ? 'Ничего не найдено' : `Всего ${total}`}
      </div>

      {/* ── Модалка создать/править ──────────────────────────────────────────── */}
      {modal.mode !== 'closed' && (
        <AmenityFormModal
          amenity={modal.mode === 'edit' ? modal.amenity : null}
          onClose={() => setModal({ mode: 'closed' })}
        />
      )}
    </div>
  );
}
