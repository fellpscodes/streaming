"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  id: string;
  title: string;
  href?: string;
  children: React.ReactNode;
}

/** Fileira rolável com snap. As setas só existem quando há para onde rolar (desktop; no celular vale o toque). */
export function Carousel({ id, title, href, children }: Props) {
  const ref = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // Mede se há conteúdo escondido de cada lado (tolerância de 2px por causa de arredondamento).
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 2);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // O observer dispara na primeira medição e a cada mudança de tamanho (janela, itens novos).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [measure]);

  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section aria-labelledby={id} className="group/carousel relative">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id={id} className="text-lg font-semibold">{title}</h2>
        {href && <Link href={href} className="text-sm text-neutral-400 hover:text-white">Ver tudo →</Link>}
      </div>
      <ul
        ref={ref}
        onScroll={measure}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:thin] sm:gap-4"
      >
        {children}
      </ul>
      {(["prev", "next"] as const).map((d) =>
        (d === "next" ? canNext : canPrev) ? (
          <button
            key={d}
            type="button"
            onClick={() => scroll(d === "next" ? 1 : -1)}
            aria-label={d === "next" ? `Avançar ${title}` : `Voltar ${title}`}
            className={`absolute top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-xl text-white opacity-0 transition hover:bg-accent focus-visible:opacity-100 group-hover/carousel:opacity-100 lg:flex ${d === "next" ? "-right-3" : "-left-3"}`}
          >
            {d === "next" ? "›" : "‹"}
          </button>
        ) : null,
      )}
    </section>
  );
}
