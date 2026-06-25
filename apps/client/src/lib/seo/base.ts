/**
 * SEO-хелпер: базовый URL сайта.
 * Читается из NEXT_PUBLIC_SITE_URL или дефолт https://avino.uz.
 */
export const BASE =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://avino.uz';
