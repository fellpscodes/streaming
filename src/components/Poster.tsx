/* eslint-disable @next/next/no-img-element -- capas vêm de CDNs externas; a URL fica cacheada no banco */
"use client";

import { useState } from "react";
import { posterSrcSet, sized } from "@/lib/images";

interface Props {
  src: string | null;
  title: string;
  className?: string;
  /** "hero" usa a imagem original (detalhes); "grid" deixa o navegador escolher entre 342/500/780px. */
  variant?: "grid" | "hero";
  sizes?: string;
}

/** Capa com fallback: placeholder com o título em texto quando não há capa ou ela falha ao carregar. */
export function Poster({ src, title, className = "", variant = "grid", sizes = "(min-width: 1024px) 200px, (min-width: 640px) 25vw, 45vw" }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`Sem capa: ${title}`}
        className={`flex aspect-[2/3] items-center justify-center bg-gradient-to-br from-surface to-border p-3 text-center text-sm font-semibold text-neutral-300 ${className}`}
      >
        {title}
      </div>
    );
  }
  const hero = variant === "hero";
  return (
    <img
      src={hero ? (sized(src, "original") ?? src) : (sized(src, "w500") ?? src)}
      srcSet={hero ? undefined : posterSrcSet(src)}
      sizes={hero ? undefined : sizes}
      alt={title}
      loading={hero ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
      className={`aspect-[2/3] object-cover ${className}`}
    />
  );
}
