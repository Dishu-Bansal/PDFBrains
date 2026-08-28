import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Dropzone } from "./Dropzone";

export function Hero() {
  const reduce = useReducedMotion();
  const [heroFiles, setHeroFiles] = useState<File[]>([]);

  const onHeroFiles = (files: File[]) => {
    setHeroFiles(files);
    if (files.length > 0) {
      document.getElementById("tools")?.scrollIntoView();
    }
  };

  const fade = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <section className="mx-auto flex min-h-[100dvh] max-w-[1400px] items-center px-4 pb-20 pt-24 sm:px-6 lg:px-8">
      <div className="grid w-full items-center gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6">
          <motion.h1
            {...fade(0)}
            className="max-w-[11ch] text-5xl font-semibold leading-[1.02] tracking-tighter sm:text-6xl lg:text-7xl"
          >
            Every PDF job, handled.
          </motion.h1>

          <motion.p
            {...fade(0.08)}
            className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted"
          >
            Merge, split, compress and convert in seconds. No installs, no sign-up, no waiting.
          </motion.p>

          <motion.div {...fade(0.16)} className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/#tools"
              className="inline-flex h-12 items-center rounded-full bg-ink px-7 text-[16px] font-medium text-paper transition hover:opacity-90 active:scale-[0.97]"
            >
              Browse tools
            </Link>
            <Link
              to="/#how"
              className="inline-flex h-12 items-center rounded-full border border-line bg-surface px-7 text-[16px] font-medium text-ink transition hover:border-linestrong active:scale-[0.97]"
            >
              How it works
            </Link>
          </motion.div>
        </div>

        <motion.div
          {...fade(0.12)}
          className="relative lg:col-span-6"
          aria-label="Upload your files"
        >
          {/* Layered paper behind the dropzone: the "stack on the desk". */}
          <div
            aria-hidden="true"
            className="absolute -right-2 -top-5 hidden h-44 w-36 rotate-6 rounded-2xl border border-line bg-surface/70 sm:block"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-5 -left-2 hidden h-44 w-36 -rotate-3 rounded-2xl border border-line bg-surface/70 sm:block"
          />
          <div className="relative">
            <Dropzone files={heroFiles} onFiles={onHeroFiles} variant="hero" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
