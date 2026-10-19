export function NationalPaintPlaceholder({ title }: { title: string }) {
  return (
    <section>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">This page is coming soon.</p>
    </section>
  );
}
