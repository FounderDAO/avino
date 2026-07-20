/**
 * AgentAvatar — аватар агента: avatarUrl → фото, иначе инициал-плейсхолдер
 * (как в ProfileMenu), иначе иконка.
 *
 * Общий для карточки каталога (AgentCard, сетка на главной) и широкой строки
 * каталога /agents (AgentRow) — размер задаётся пропом, чтобы одна и та же
 * логика fallback'ов не расходилась между двумя компонентами.
 */
import { User } from 'lucide-react';

/** Размеры: sm — карточка главной (48px), lg — строка каталога (72/96px). */
const BOX: Record<'sm' | 'lg', string> = {
  sm: 'h-12 w-12 text-lg',
  lg: 'h-[72px] w-[72px] text-2xl sm:h-24 sm:w-24 sm:text-[28px]',
};

const ICON: Record<'sm' | 'lg', number> = { sm: 20, lg: 30 };

/** Первая буква имени для аватара-плейсхолдера (нет имени → null). */
const initial = (name: string | null) =>
  name && name.trim() ? name.trim().charAt(0).toUpperCase() : null;

export function AgentAvatar({
  name,
  avatarUrl,
  size = 'sm',
}: {
  name: string | null;
  avatarUrl: string | null;
  size?: 'sm' | 'lg';
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint font-extrabold text-teal-deep ${BOX[size]}`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : initial(name) ? (
        initial(name)
      ) : (
        <User size={ICON[size]} strokeWidth={1.9} />
      )}
    </span>
  );
}
