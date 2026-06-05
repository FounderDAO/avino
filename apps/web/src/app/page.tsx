export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <h1 className="text-h1 font-semibold text-text-dark">Avino</h1>
      <p className="text-body text-text-secondary">
        Портал недвижимости для Узбекистана.
      </p>
      <span className="inline-flex w-fit rounded-pill bg-primary px-4 py-1 text-small text-bg-white">
        Tailwind v4 · Next 15 · React 19
      </span>
    </main>
  );
}
