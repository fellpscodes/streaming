"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { CardTitle } from "@/lib/home-types";
import { ArcDefs } from "./DiscArt";
import { CaseTile } from "./CaseTile";
import "./disc.css";

/** Grade do catálogo: a caixa levanta e o disco aparece pela lateral ao passar o mouse ou focar; clicar abre o título. */
export function CatalogGrid({ titles }: { titles: CardTitle[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const open = (id: number | null, delay = 0) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpenId(id), delay);
  };
  return (
    <>
      <ArcDefs />
      <div className="dc-grid" role="list">
        {titles.map((t) => (
          <CaseTile
            key={t.id}
            t={t}
            tileKey={`g:${t.id}`}
            href={`/titulo/${t.id}`}
            open={openId === t.id}
            onPointerEnter={(e: PointerEvent) => e.pointerType === "mouse" && open(t.id, 120)}
            onPointerLeave={(e: PointerEvent) => e.pointerType === "mouse" && open(null, 120)}
            onFocus={(e) => (e.currentTarget as HTMLElement).matches(":focus-visible") && open(t.id)}
            onBlur={() => open(null)}
          />
        ))}
      </div>
    </>
  );
}
