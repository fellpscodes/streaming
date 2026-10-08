"use client";

import Link from "next/link";
import { useRef } from "react";

interface Props {
  id: string;
  title: string;
  href?: string;
  children: React.ReactNode;
}

/** Fileira rolável com snap. Setas aparecem no desktop; no celular vale o toque. */
export function Carousel({ id, title, href, children }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section aria-labelledby={id} className="group/carousel relative">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id={id} className="text-lg font-semibold">{title}</h2>
        {href && <Link href={href} className="text-sm text-neutral-400 hover:text-white">Ver tudo →</Link>}
      </div>
      <ul ref={ref} className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:thin] sm:gap-4">
        {children}
      </ul>
      {(["prev", "next"] as const).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => scroll(d === "next" ? 1 : -1)}
          aria-label={d === "next" ? `Avançar ${title}` : `Voltar ${title}`}
          className={`absolute top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-xl text-white opacity-0 transition hover:bg-accent focus-visible:opacity-100 group-hover/carousel:opacity-100 lg:flex ${d === "next" ? "-right-3" : "-left-3"}`}
        >
          {d === "next" ? "›" : "‹"}
        </button>
      ))}
    </section>
  );
}
