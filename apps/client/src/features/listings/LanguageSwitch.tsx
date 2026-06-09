'use client';

import { Language } from '@avino/shared';
import { cn } from '@/lib/utils';
import { LANGUAGE_LABELS } from './format';

/**
 * Переключатель языка перевода карточки (TASK-153, критерий приёмки
 * «translations are displayed by selected language»).
 *
 * Сегментированный контрол UZ/RU/EN; смена значения меняет `?lang` запроса
 * `getListing` — RTK Query рефетчит перевод (ADR-012). Глобального language-
 * switcher в публичном портале ещё нет; здесь — локальный, на уровне страницы.
 */

const ORDER: Language[] = [Language.UZ, Language.RU, Language.EN];

export function LanguageSwitch({
  value,
  onChange,
}: {
  value: Language;
  onChange: (lang: Language) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full bg-segment-track p-1"
      role="group"
      aria-label="Язык объявления"
    >
      {ORDER.map((lang) => {
        const selected = lang === value;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => onChange(lang)}
            aria-pressed={selected}
            title={LANGUAGE_LABELS[lang]}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-bold transition-colors',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {lang}
          </button>
        );
      })}
    </div>
  );
}
