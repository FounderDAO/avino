import type {
  GenerateTranslationsResult,
  TranslationItem,
  TranslationLanguage,
} from '@/store/api/adminTypes';
import { getApiError } from '@/store/api/apiError';

/** Человекочитаемые названия языков (совпадают с TranslationRow). */
const LANG_LABEL: Record<TranslationLanguage, string> = {
  RU: 'Русский',
  UZ: 'Ўзбекча',
  EN: 'English',
};

const langList = (langs: TranslationLanguage[]): string =>
  langs.map((l) => LANG_LABEL[l] ?? l).join(', ');

/**
 * Честный тост по итогу `POST /admin/listings/:id/translations/generate`
 * (ADR-0091). Не врёт «Переводы сгенерированы», когда на деле ничего не
 * тронуто:
 * - ничего не сгенерировано, но что-то пропущено (правлено вручную) → подсказать
 *   «Перевести заново» (force);
 * - `forced` (force=true) → перечислить перезаписанные языки;
 * - обычный прогон → перечислить сгенерированные (и пропущенные, если есть).
 */
export function translationResultToast(
  result: GenerateTranslationsResult,
  opts: { forced?: boolean } = {},
): string {
  const { regenerated, skipped } = result;

  if (regenerated.length === 0) {
    return skipped.length > 0
      ? 'Ничего не сгенерировано — все переводы правлены вручную. Нажмите «Перевести заново», чтобы перезаписать.'
      : 'Нет языков для перевода.';
  }

  if (opts.forced) {
    return `Переведено заново: ${langList(regenerated)}.`;
  }

  const base = `Сгенерированы переводы: ${langList(regenerated)}.`;
  return skipped.length > 0
    ? `${base} Пропущены (правлено вручную): ${langList(skipped)}.`
    : base;
}

/**
 * React-`key` строки перевода в панели «Переводы». Редакторы держат текст в
 * локальном стейте, инициализируемом один раз, поэтому ключ обязан меняться
 * вместе с серверной строкой: иначе после «Сгенерировать/Перевести заново» поле
 * показывает старый текст, а при переключении объявления в очереди — текст
 * предыдущего объявления (и «Сохранить» записал бы его в чужое объявление).
 */
export function translationRowKey(listingId: string, item: TranslationItem): string {
  return [
    listingId,
    item.language,
    item.is_auto_translated ? 'auto' : 'manual',
    item.description ?? '',
  ].join(':');
}

const PROVIDER_FAILED_PREFIX = 'Translation provider failed: ';

/**
 * Тост при сбое генерации переводов. `502` несёт причину отказа провайдера
 * (истёкший ключ, неверный folder и т.п.) — показываем её, чтобы модератор мог
 * передать администратору конкретику, а не «не удалось».
 */
export function translationErrorToast(error: unknown): string {
  const message = getApiError(error as never)?.message ?? '';
  if (message.startsWith(PROVIDER_FAILED_PREFIX)) {
    return `Сервис перевода недоступен: ${message.slice(PROVIDER_FAILED_PREFIX.length)}`;
  }
  return 'Не удалось сгенерировать переводы';
}

/**
 * Предупреждение модератору: провайдер определил в авторском тексте другой
 * язык, чем `original_language` (автор не переключил язык в форме). Перевод с
 * неверного языка-источника выходит некорректным или не выходит вовсе.
 * `result` — ответ последней генерации; чужой листинг и уже исправленный язык
 * оригинала предупреждение гасят.
 */
export function originalLanguageMismatchWarning(
  result: GenerateTranslationsResult | undefined,
  listingId: string,
  originalLanguage: TranslationLanguage | undefined,
): string | null {
  const detected = result?.detected_language;
  if (
    !result ||
    !detected ||
    !originalLanguage ||
    result.listing_id !== listingId ||
    detected === originalLanguage
  ) {
    return null;
  }
  return (
    `Текст оригинала похож на «${LANG_LABEL[detected]}», а язык оригинала указан ` +
    `«${LANG_LABEL[originalLanguage]}». Исправьте язык оригинала и переведите ` +
    'заново — иначе перевод будет некорректным.'
  );
}
