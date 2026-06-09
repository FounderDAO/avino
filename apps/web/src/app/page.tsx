import { redirect } from 'next/navigation';

/** Корень web-приложения — это админка. Перенаправляем на /admin. */
export default function Home() {
  redirect('/admin');
}
