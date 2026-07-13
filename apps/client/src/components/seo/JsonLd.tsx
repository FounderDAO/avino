/**
 * JsonLd — серверный компонент для вставки JSON-LD структурированных данных.
 * Рендерит <script type="application/ld+json"> безопасно через dangerouslySetInnerHTML.
 * Используется в layout и на страницах с богатой разметкой Schema.org.
 */

interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[];
}

export function JsonLd({ data }: JsonLdProps) {
  // JSON.stringify не экранирует `<`: строка `</script>` в пользовательском
  // поле (title/desc/address объявления) вырвалась бы из тега → stored XSS.
  // Unicode-escape (u003c) эквивалентен для JSON-парсеров, но безопасен в теге.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
