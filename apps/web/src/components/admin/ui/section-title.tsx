/** Заголовок раздела с опциональным подзаголовком (порт SectionTitle). */
export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontSize: 26 }}>{children}</h1>
      {sub && <p className="muted" style={{ marginTop: 3 }}>{sub}</p>}
    </div>
  );
}
