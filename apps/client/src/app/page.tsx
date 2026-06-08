export default function HomePage() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
        Avino · публичный портал
      </span>
      <h1 className="text-4xl font-bold tracking-tight">
        Недвижимость Узбекистана
      </h1>
      <p className="max-w-xl text-muted-foreground">
        Каркас пользовательского фронтенда готов. Hero и поиск (TASK-191),
        секции объявлений (TASK-192) и карта (TASK-152) добавляются дальше.
      </p>
    </section>
  );
}
