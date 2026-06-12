import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Все маршруты, кроме API, статики Next и файлов с расширением.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
