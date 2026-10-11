/**
 * What a search shows while it looks: a thin brass line running under the
 * box and the word itself, for exactly as long as the answer takes — no
 * longer, so a quick answer is simply there. The results under it are dimmed
 * meanwhile (globals.css, "searching").
 */
export function SearchingPanel({ label }: { label: string }) {
  return (
    <div className="searching" role="status" aria-live="polite">
      <span className="searching-line" aria-hidden />
      <span className="searching-label">{label}</span>
    </div>
  );
}
