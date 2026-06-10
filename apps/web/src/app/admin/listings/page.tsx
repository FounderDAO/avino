/**
 * Объявления — таблица всех объявлений на реальном API (RTK Query).
 * Фильтр по статусу, поиск (q, debounce), серверная пагинация. Клик по строке →
 * /admin/listings/{id}. Вёрстка 1:1 с прототипом; данные — GET /admin/listings.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { StatusPill } from '@/components/admin/ui/pill';
import { IC } from '@/components/admin/icons';
import { useToast } from '@/components/admin/toast';
import { useListAdminListingsQuery } from '@/store/api/adminListingsApi';
import { totalPages } from '@/store/api/adminApi';
import { rowToAdminListing, UI_FILTER_TO_API_STATUS } from '@/lib/adapters/listings';

const LIMIT = 20;

const filters: [string, string][] = [
  ['ALL', 'Все'],
  ['ACTIVE', 'Опубликовано'],
  ['PENDING', 'На проверке'],
  ['REJECTED', 'Отклонено'],
  ['DRAFT', 'Черновики'],
  ['ARCHIVED', 'Архив'],
];

export default function ListingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<string>('ALL');
  const [q, setQ] = useState<string>('');
  const [debouncedQ, setDebouncedQ] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [sel, setSel] = useState<Set<string>>(new Set());

  // Дебаунс поиска (400мс), чтобы не дёргать API на каждый символ.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 400);
    return () => clearTimeout(t);
  }, [q]);

  // Смена фильтра/запроса — на первую страницу.
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedQ]);

  const { data, isLoading, isFetching, isError, refetch } = useListAdminListingsQuery({
    status: UI_FILTER_TO_API_STATUS[filter],
    q: debouncedQ.trim() || undefined,
    page,
    limit: LIMIT,
  });

  const rows = (data?.data ?? []).map(rowToAdminListing);
  const total = data?.meta.total ?? 0;
  const pages = totalPages(data?.meta);

  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <SectionTitle sub={`${total} объявлений всего`}>Объявления</SectionTitle>
        <div className="row gap-8">
          <button className="abtn abtn-outline" onClick={() => toast('Экспорт в CSV')}>Экспорт</button>
          <button className="abtn abtn-primary" onClick={() => toast('Форма создания объявления')}><IC.Plus size={17} /> Добавить</button>
        </div>
      </div>
      <div className="row gap-8" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', minWidth: 240 }}>
          <IC.Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input className="a-field" style={{ paddingLeft: 36, width: '100%' }} placeholder="Поиск по названию…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filters.map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)} className="abtn abtn-sm" style={{ background: filter === k ? 'var(--ink)' : 'var(--surface)', color: filter === k ? '#fff' : 'var(--ink)', border: filter === k ? 'none' : '1.5px solid var(--border)' }}>{v}</button>
        ))}
      </div>
      {sel.size > 0 && (
        <div className="row gap-12" style={{ background: 'var(--ink)', color: '#fff', borderRadius: 10, padding: '10px 16px', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Выбрано: {sel.size}</span>
          <button className="abtn abtn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={() => toast('Массово одобрено')}>Одобрить</button>
          <button className="abtn abtn-sm" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} onClick={() => toast('Перемещено в архив')}>В архив</button>
          <button className="abtn abtn-ghost abtn-sm" style={{ color: 'rgba(255,255,255,.7)', marginLeft: 'auto' }} onClick={() => setSel(new Set())}>Снять выбор</button>
        </div>
      )}
      {isError ? (
        <div className="a-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="muted" style={{ marginBottom: 14 }}>Не удалось загрузить объявления.</p>
          <button className="abtn abtn-outline" onClick={() => refetch()}>Повторить</button>
        </div>
      ) : (
        <div className="a-card table-scroll">
          <table className="a-table">
            <thead><tr>
              <th style={{ width: 36 }}><input type="checkbox" checked={allSel} onChange={toggleAll} disabled={rows.length === 0} /></th>
              <th>Объявление</th><th>Цена</th><th>Тип</th><th>Комн.</th><th>Район</th><th>Агент</th><th>Статус</th><th>Просм.</th><th>Создано</th><th></th>
            </tr></thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 40 }}>Загрузка…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 40 }}>Ничего не найдено.</td></tr>
              ) : (
                rows.map((l) => (
                  <tr key={l.id} className="clickable" onClick={() => router.push(`/admin/listings/${l.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
                    <td><div className="row" style={{ minWidth: 220, gap: 14 }}>
                      <div style={{ width: 48, height: 38, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={l.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{l.title}</div><div className="muted" style={{ fontSize: 12 }}>{l.tx} · {l.promo !== 'NORMAL' ? l.promo : '—'}</div></div>
                    </div></td>
                    <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{l.price}</td>
                    <td className="muted">{l.type}</td>
                    <td>{l.rooms}</td>
                    <td className="muted">{l.district}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{l.agent}</td>
                    <td><StatusPill status={l.status} /></td>
                    <td>{l.views}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{l.created}</td>
                    <td onClick={(e) => e.stopPropagation()}><button className="aicon-btn" style={{ width: 30, height: 30 }} onClick={() => router.push(`/admin/listings/${l.id}`)}>⋯</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
        <span>{isFetching ? 'Обновление…' : `Показано ${rows.length} из ${total}`}</span>
        <div className="row gap-4">
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><IC.ChevronLeft size={16} /></button>
          <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>{page}</button>
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={pages > 0 && page >= pages} onClick={() => setPage((p) => p + 1)}><IC.ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}
