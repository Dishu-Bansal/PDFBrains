import { LockSimple } from "@phosphor-icons/react";

export function PrivacyStrip() {
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-3 sm:px-6 lg:px-8">
        <LockSimple size={18} className="shrink-0 text-accent" weight="regular" />
        <p className="text-[14px] leading-relaxed text-muted">
          <span className="font-medium text-ink">Private by design.</span> Your files are handled
          only for the job at hand and are never stored longer than they need to be.
        </p>
      </div>
    </section>
  );
}
