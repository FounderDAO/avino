'use client';

/**
 * История согласий — журнал принятия Правил и Политики (`GET /admin/legal-consents`).
 * Только просмотр. Фильтры: поиск по пользователю (дебаунс), версия (app-wide
 * счётчик согласия), диапазон дат принятия. Справочная панель сверху показывает
 * версии с датой введения и числом согласий. Серверная пагинация; состояния
 * loading/empty/error — как на /admin/otp-history.
 */
import { useEffect, useMemo, useState } from 'react';
import { SectionTitle } from '@/components/admin/ui/section-title';
import { IC } from '@/components/admin/icons';
import { DEFAULT_LIMIT, totalPages } from '@/store/api/adminApi';
import {
  useListLegalConsentsQuery,
  useLegalConsentVersionsQuery,
} from '@/store/api/adminLegalConsentsApi';
import { legalConsentToRow, fmtVersionDate } from '@/lib/adapters/legalConsents';

const DEBOUNCE_MS = 400;

export default function LegalConsentsPage() {
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [debounced, version, from, to]);

  const { data: versions } = useLegalConsentVersionsQuery();

  const { data, isLoading, isFetching, isError, refetch } =
    useListLegalConsentsQuery({
      search: debounced.trim() || undefined,
      version: version ? Number(version) : undefined,
      // `to` из <input type=date> = начало дня; включаем весь день до 23:59:59.999.
      from: from ? new Date(from + 'T00:00:00.000Z').toISOString() : undefined,
      to: to ? new Date(to + 'T23:59:59.999Z').toISOString() : undefined,
      page,
      limit: DEFAULT_LIMIT,
    });

  const rows = (data?.data ?? []).map(legalConsentToRow);
  const total = data?.meta?.total ?? 0;
  const pages = totalPages(data?.meta);

  const versionDate = useMemo(() => {
    const m = new Map<number, string | null>();
    (versions ?? []).forEach((v) => m.set(v.version, v.effective_at));
    return m;
  }, [versions]);

  return (
    <div>
      <SectionTitle sub="Журнал согласий с Правилами и Политикой. Версия — общий счётчик согласия для обоих документов. Только просмотр.">
        История согласий
      </SectionTitle>

      {versions && versions.length > 0 && (
        <div className="row gap-4" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
          {versions.map((v) => (
            <span
              key={v.version}
              className="a-pill"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--ink)',
                border: '1px solid var(--border)',
              }}
            >
              v{v.version} · с {fmtVersionDate(v.effective_at)} · {v.count} согл.
            </span>
          ))}
        </div>
      )}

      <div className="row gap-4" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 260 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            Пользователь
          </label>
          <input
            className="a-field"
            style={{ width: '100%' }}
            placeholder="Имя, телефон или email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            Версия
          </label>
          <select
            className="a-field"
            style={{ width: '100%' }}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value="">Все версии</option>
            {(versions ?? []).map((v) => (
              <option key={v.version} value={String(v.version)}>
                v{v.version} ({v.count})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            С
          </label>
          <input type="date" className="a-field" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            По
          </label>
          <input type="date" className="a-field" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="a-card table-scroll">
        <table className="a-table">
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Контакт</th>
              <th>Версия</th>
              <th style={{ textAlign: 'right' }}>Когда</th>
            </tr>
          </thead>
          <tbody>
            {isError && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ marginBottom: 12 }}>Не удалось загрузить журнал.</div>
                  <button className="abtn abtn-outline" onClick={refetch}>
                    Повторить
                  </button>
                </td>
              </tr>
            )}
            {!isError && isLoading && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isError && !isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 40 }}>
                  Записей не найдено.
                </td>
              </tr>
            )}
            {!isError &&
              !isLoading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.user}</td>
                  <td className="muted mono" style={{ whiteSpace: 'nowrap' }}>
                    {r.contact}
                  </td>
                  <td>
                    <span
                      className="a-pill"
                      style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)' }}
                      title={`Версия введена: ${fmtVersionDate(versionDate.get(r.version) ?? null)}`}
                    >
                      v{r.version}
                    </span>
                  </td>
                  <td className="muted" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {r.when}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5, color: 'var(--muted)' }}>
        <span>{isFetching ? 'Обновление…' : `Показано ${rows.length} из ${total}`}</span>
        <div className="row gap-4">
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <IC.ChevronLeft size={16} />
          </button>
          <button className="abtn abtn-sm" style={{ background: 'var(--ink)', color: '#fff' }}>
            {page}
          </button>
          <button className="aicon-btn" style={{ width: 32, height: 32 }} disabled={pages > 0 && page >= pages} onClick={() => setPage((p) => p + 1)}>
            <IC.ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
