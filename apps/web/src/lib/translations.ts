import type {
  GenerateTranslationsResult,
  TranslationLanguage,
} from '@/store/api/adminTypes';

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
