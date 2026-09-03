/**
 * "Upcoming" pill shown on tools whose processing is not implemented yet.
 * Those tools stay in the catalog but are disabled in every surface.
 */
export function UpcomingTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-linestrong bg-raised px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted">
      Upcoming
    </span>
  );
}
