/**
 * /llms-full.txt — /llms.txt плюс 200 последних активных объявлений
 * (заголовок из полей объекта, цена, URL). Кэш — час.
 */
import { renderLlmsTxt } from '@/lib/seo/llmsData';

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  return new Response(await renderLlmsTxt(true), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
