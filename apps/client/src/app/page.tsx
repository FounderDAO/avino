export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
        Avino · публичный портал
      </span>
      <h1 className="text-4xl font-bold tracking-tight">
        Недвижимость Узбекистана
      </h1>
      <p className="max-w-xl text-muted-foreground">
        Каркас пользовательского фронтенда. Бизнес-страницы (поиск, объявления,
        карта, избранное, чат) добавляются в следующих задачах.
      </p>
    </main>
  );
}
