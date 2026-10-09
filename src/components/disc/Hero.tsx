"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_LABEL } from "@/lib/category";
import { posterSrcSet, sized } from "@/lib/images";
import type { CardTitle } from "@/lib/home-types";
import { IconMute, IconPlay, IconVol } from "./icons";

/** Uma das duas camadas da prévia: troca de título é um fade entre elas. */
export function HeroLayer({ t, on, muted, reduced }: { t: CardTitle; on: boolean; muted: boolean; reduced: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const useVideo = t.preview && !reduced;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (on) void v.play().catch(() => {});
    else v.pause();
    // ao esconder a tela (o Next mantém a Home montada ao ir para outra página), o vídeo para
    return () => v.pause();
  }, [on, t.id, useVideo]);
  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  const still = t.preview ? `/api/preview/${t.id}?kind=poster` : (sized(t.backdrop, "original") ?? sized(t.poster, "original"));
  return (
    <div className={`dc-hv${on ? " on" : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- fundo em qualidade original, de CDN externo ou do cache local */}
      {still && <img src={still} alt="" className={t.preview ? "" : "kb"} decoding="async" />}
      {useVideo && (
        <video
          ref={video}
          src={`/api/preview/${t.id}?kind=video`}
          muted
          loop
          playsInline
          preload={on ? "auto" : "none"}
          className={ready ? "ready" : ""}
          onPlaying={() => setReady(true)}
        />
      )}
    </div>
  );
}

interface Props {
  t: CardTitle;
  swap: boolean;
  muted: boolean;
  onMute: () => void;
  onPlay: () => void;
}

/** Texto e botões sobre a prévia. */
export function HeroInfo({ t, swap, muted, onMute, onPlay }: Props) {
  const tag = t.progress ? "Continuar" : t.isNew ? "Novo" : null;
  const long = t.name.length > 13;
  return (
    <div className="dc-hinfo">
      <div className="dc-hcase" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- capa em CDN externo */}
        {t.poster && <img src={sized(t.poster, "w500") ?? undefined} srcSet={posterSrcSet(t.poster)} sizes="210px" alt="" />}
      </div>
      <div className={`dc-htext${swap ? " swap" : ""}`}>
        <div className="dc-hk">
          {tag ? <span className="dc-tag">{tag}</span> : null}
          <span className="dc-tag ghost">{CATEGORY_LABEL[t.category].replace(/s$/, "")}</span>
        </div>
        <h1 className={long ? "long" : ""}>{t.name}</h1>
        <p className="dc-hmeta">
          {t.rating != null && <span className="sc">{t.rating.toFixed(1).replace(".", ",")}</span>}
          {t.year && <span>{t.year}</span>}
          <span>{t.episodes} {t.episodes === 1 ? "arquivo" : "episódios"}</span>
          {t.genres.length > 0 && <span>{t.genres.slice(0, 3).join(", ")}</span>}
        </p>
        {t.overview && <p className="dc-hsyn">{t.overview}</p>}
        <div className="dc-hact">
          {t.playEpisodeId != null && (
            <button type="button" className="dc-btn-play" onClick={onPlay}>
              <IconPlay />
              {t.progress?.started ? "Continuar" : "Assistir"}
            </button>
          )}
          <Link href={`/titulo/${t.id}`} className="dc-btn-ghost">Detalhes</Link>
          {t.preview && (
            <button type="button" className="dc-round" onClick={onMute} aria-label={muted ? "Ativar som da prévia" : "Silenciar a prévia"}>
              {muted ? <IconMute /> : <IconVol />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
