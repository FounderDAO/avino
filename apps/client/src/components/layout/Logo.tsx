/**
 * Logo — бренд-лого Avino. Иконка — готовый ассет
 * `src/assets/logo/avino-appicon.svg` (красный скруглённый квадрат + белый
 * глиф), рядом — словесный знак «avino» (900, тесный трекинг).
 * По умолчанию ведёт на главную (<Link>). `light` — белый текст для тёмных
 * поверхностей (футер, CTA).
 */
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import logoIcon from '@/assets/logo/avino-appicon.svg';

export interface LogoProps {
  /** Базовый размер (px) — масштабирует иконку и текст. */
  size?: number;
  /** Светлый вариант текста (для тёмного футера). */
  light?: boolean;
  /** Куда ведёт лого (по умолчанию /). */
  href?: string;
  className?: string;
}

export function Logo({ size = 22, light = false, href = '/', className }: LogoProps) {
  const t = useTranslations('nav');
  const box = Math.round(size * 1.45);
  return (
    <Link
      href={href}
      aria-label={t('logoAria')}
      className={cn('inline-flex items-center gap-[9px]', className)}
    >
      <Image
        src={logoIcon}
        alt=""
        width={box}
        height={box}
        priority
        style={{ width: box, height: box, borderRadius: Math.round(size * 0.32) }}
        className="shadow-[0_3px_10px_rgba(224,60,66,0.35)]"
      />
      <span
        className={cn('font-black tracking-[-0.045em]', light ? 'text-white' : 'text-ink')}
        style={{ fontSize: size }}
      >
        avino
      </span>
    </Link>
  );
}
