import { DownloadSimple, SquaresFour, TrayArrowDown } from "@phosphor-icons/react";

import { Reveal } from "./Reveal";

const STEPS = [
  {
    Icon: TrayArrowDown,
    title: "Drop files",
    body: "Drag anything in, or browse from your device. Multiple files welcome.",
  },
  {
    Icon: SquaresFour,
    title: "Pick a tool",
    body: "Choose the job from the toolbox. The right one is usually obvious.",
  },
  {
    Icon: DownloadSimple,
    title: "Get the result",
    body: "Download the finished file straight away. Nothing is kept for later.",
  },
];

export function Workspace() {
  return (
    <section id="how" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="max-w-[52ch]">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              From drop to download in three steps.
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">
              No account, no queue, no surprises. The whole flow fits on one screen.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <div className="grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
            {STEPS.map((step) => (
              <div key={step.title} className="md:px-10 md:first:pl-0 md:last:pr-0">
                <span className="flex size-11 items-center justify-center rounded-[12px] bg-accentsoft text-accent">
                  <step.Icon size={23} weight="regular" />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
