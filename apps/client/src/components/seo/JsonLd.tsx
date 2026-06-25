/**
 * JsonLd — серверный компонент для вставки JSON-LD структурированных данных.
 * Рендерит <script type="application/ld+json"> безопасно через dangerouslySetInnerHTML.
 * Используется в layout и на страницах с богатой разметкой Schema.org.
 */

interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[];
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
