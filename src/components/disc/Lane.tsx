"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { IconBack, IconNext } from "./icons";

interface Props {
  id: string;
  label: string;
  count: number;
  onPointerEnter?: () => void;
  onPointerLeave?: (e: PointerEvent) => void;
  children: ReactNode;
}

/** Fileira rolável. As setas só aparecem quando há para onde rolar. */
export function Lane({ id, label, count, onPointerEnter, onPointerLeave, children }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(sync); // dispara na primeira medição e quando uma caixa abre e muda a largura
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [sync, count]);

  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8 });
  return (
    <section className="dc-lane" aria-labelledby={`lane-${id}`}>
      <h2 id={`lane-${id}`}>
        {label}
        <span>{count}</span>
      </h2>
      {canPrev && (
        <button type="button" className="dc-arrow l" aria-label={`Voltar em ${label}`} onClick={() => scroll(-1)}><IconBack /></button>
      )}
      <div ref={track} className="dc-track" role="list" onScroll={sync} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
        {children}
      </div>
      {canNext && (
        <button type="button" className="dc-arrow r" aria-label={`Avançar em ${label}`} onClick={() => scroll(1)}><IconNext /></button>
      )}
    </section>
  );
}
