export function Card({
  title,
  description,
  children
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {(title || description) && (
        <header className="mb-4">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}




