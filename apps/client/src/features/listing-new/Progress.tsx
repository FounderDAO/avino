/**
 * Progress — индикатор шагов визарда (порт Progress из listing-new.jsx).
 * Принимает список названий шагов и текущий шаг (1-based).
 * Кружки: done — teal с галочкой, текущий — red, остальные — серый.
 */
import { Check } from 'lucide-react';

export interface ProgressProps {
  /** Подписи шагов по порядку. */
  steps: string[];
  /** Текущий шаг (1-based). */
  step: number;
}

export function Progress({ steps, step }: ProgressProps) {
  return (
    <div className="mb-7 flex">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < step;
        const cur = n === step;
        const last = i === steps.length - 1;
        return (
          <div
            key={s}
            className={'flex min-w-0 items-start ' + (last ? 'flex-none' : 'flex-1')}
          >
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <div
                className={
                  'flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold ' +
                  (done
                    ? 'bg-teal text-white'
                    : cur
                      ? 'bg-red text-white'
                      : 'border-[1.5px] border-border bg-surface text-muted-foreground')
                }
              >
                {done ? <Check size={16} strokeWidth={3} /> : n}
              </div>
              <span
                className={
                  'hidden whitespace-nowrap text-[11.5px] font-bold sm:block ' +
                  (cur ? 'text-ink' : 'text-muted-foreground')
                }
              >
                {s}
              </span>
            </div>
            {!last && (
              <div
                className={
                  'mx-2 mt-[15px] h-0.5 flex-1 ' + (done ? 'bg-teal' : 'bg-border')
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
