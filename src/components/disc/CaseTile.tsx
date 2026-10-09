"use client";

import Link from "next/link";
import { memo, useEffect, useState, type PointerEvent, type FocusEvent } from "react";
import { CATEGORY_LABEL } from "@/lib/category";
import { posterSrcSet, sized } from "@/lib/images";
import type { CardTitle } from "@/lib/home-types";
import { DiscArt, discLabel } from "./DiscArt";

interface Props {
  t: CardTitle;
  /** Chave única do ladrilho (o mesmo título aparece em várias fileiras). */
  tileKey: string;
  open?: boolean;
  /** É o título que está na prévia do topo. */
  current?: boolean;
  /** Com `href` a caixa é um link (catálogo); sem ele, um botão (Home). */
  href?: string;
  onClick?: () => void;
  onPointerEnter?: (e: PointerEvent) => void;
  onPointerLeave?: (e: PointerEvent) => void;
  onFocus?: (e: FocusEvent) => void;
  onBlur?: (e: FocusEvent) => void;
}

/** A caixa de CD de frente; o disco só existe enquanto a caixa está aberta (nada pesado nas centenas de caixas fechadas). */
export const CaseTile = memo(function CaseTile({ t, tileKey, open = false, current = false, href, onClick, onPointerEnter, onPointerLeave, onFocus, onBlur }: Props) {
  // mantém o disco montado um instante depois de fechar, para ele voltar deslizando para dentro da caixa
  const [keep, setKeep] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setKeep(open), open ? 0 : 800);
    return () => clearTimeout(id);
  }, [open]);
  const showDisc = open || keep;

  const label = `${t.name}${t.year ? `, ${t.year}` : ""}`;
  const pack = (
    <span className="dc-pack">
      <span className="dc-base"><span className="dc-hub" /></span>
      {showDisc && (
        <span className="dc-disc">
          <DiscArt cover={t.poster} label={discLabel(t)} />
        </span>
      )}
      <span className="dc-jc">
        <span className="dc-lf">
          {t.poster ? (
            // eslint-disable-next-line @next/next/no-img-element -- capas vêm de CDNs externos, com srcset próprio
            <img src={sized(t.poster, "w500") ?? undefined} srcSet={posterSrcSet(t.poster)} sizes="220px" alt="" loading="lazy" draggable={false} />
          ) : (
            <span className="dc-nocover">{t.name}</span>
          )}
        </span>
      </span>
      {t.isNew && !t.progress && <span className="dc-new">Novo</span>}
    </span>
  );

  const common = { className: "dc-cbtn", "aria-label": label, onPointerEnter, onPointerLeave, onFocus, onBlur } as const;
  const sub = t.progress
    ? t.progress.label
    : [t.year, t.category === "movie" ? CATEGORY_LABEL.movie.slice(0, -1) : `${t.episodes} ep.`].filter(Boolean).join(", ");

  return (
    <div className={`dc-tile${open ? " open" : ""}${current ? " current" : ""}`} data-tile={t.id} data-key={tileKey} role="listitem">
      {href ? (
        <Link href={href} {...common}>{pack}</Link>
      ) : (
        <button type="button" {...common} onClick={onClick}>{pack}</button>
      )}
      <span className="dc-cap">
        <b>{t.name}</b>
        <span>{sub}</span>
        {t.progress && (
          <span className="dc-prog" role="img" aria-label={`${Math.round(t.progress.pct)}% assistido`}>
            <i style={{ width: `${t.progress.pct}%` }} />
          </span>
        )}
      </span>
    </div>
  );
});
