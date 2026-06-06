/**
 * Общие табличные примитивы для UI админ-панели (ADMIN-07).
 *
 * Структурные типы, переиспользуемые TailAdmin-таблицами (ADMIN-08..15):
 * описания колонок, состояние пагинации, опции фильтр-селектов. Без визуальных
 * стилей — только контракт данных между страницами и табличными компонентами.
 */

import type { ReactNode } from 'react';
import type { PageMeta } from '@/store/api/pagination';

/** Направление сортировки колонки. */
export type SortDirection = 'asc' | 'desc';

/** Описание колонки таблицы: как достать и как отрендерить ячейку. */
export interface Column<Row> {
  /** Стабильный ключ колонки (для React key и сортировки). */
  key: string;
  /** Заголовок колонки (RU для MVP, i18n — ADMIN-17). */
  header: string;
  /** Выравнивание содержимого ячейки. */
  align?: 'left' | 'center' | 'right';
  /** Можно ли сортировать по колонке (UI-подсказка). */
  sortable?: boolean;
  /** Доп. классы ячейки. */
  className?: string;
  /** Рендер ячейки; по умолчанию страница сама достаёт значение из `row`. */
  render?: (row: Row) => ReactNode;
}

/** Опция для фильтр-селекта (status/role/type и т.п.). */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

/** Состояние page-based пагинации в UI (1-based). */
export interface PaginationState {
  page: number;
  limit: number;
}

/** Собрать опции селекта из карты «значение → подпись». */
export function optionsFromLabels<T extends string>(
  labels: Record<T, string>,
): SelectOption<T>[] {
  return (Object.keys(labels) as T[]).map((value) => ({
    value,
    label: labels[value],
  }));
}

/** Можно ли уйти на следующую страницу по `meta` (page-based). */
export function hasNextPage(
  meta: PageMeta | undefined,
  current: number,
): boolean {
  if (!meta) return false;
  if (typeof meta.next_cursor !== 'undefined') return meta.next_cursor !== null;
  if (!meta.total || !meta.limit) return false;
  return current * meta.limit < meta.total;
}
