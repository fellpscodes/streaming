"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { CardTitle } from "@/lib/home-types";
import type { TrendingAnime } from "@/lib/trending";
import { CaseTile } from "./CaseTile";
import { Lane } from "./Lane";

const STATUS: Record<string, string> = { RELEASING: "Em exibição", FINISHED: "Finalizado", NOT_YET_RELEASED: "Em breve" };

const toCard = (a: TrendingAnime): CardTitle => ({
  id: a.id,
  name: a.name,
  year: a.year,
  rating: a.rating,
  category: "anime",
  genres: a.genres,
  overview: a.overview,
  poster: a.poster,
  backdrop: null,
  episodes: a.episodes ?? 0,
  playEpisodeId: null,
  progress: null,
  preview: false,
  isNew: false,
});

const caption = (a: TrendingAnime) =>
  [a.rating != null ? `★ ${a.rating.toFixed(1)}` : null, a.status === "RELEASING" ? "Em exibição" : a.year].filter(Boolean).join(" · ");

/** Fileira "Animes em Alta" da Home: capas em caixas de CD; clicar abre a sinopse e o atalho para buscar no Nyaa. */
export function TrendingLane({ items }: { items: TrendingAnime[] }) {
  const cards = useMemo(() => items.map((a) => [a, toCard(a)] as const), [items]);
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<TrendingAnime | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);

  const open = (key: string | null, delay = 0) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpenKey(key), delay);
  };
  useEffect(() => {
    // Ao sair da Home o Next a mantém montada, mas esconde e desliga os efeitos: sem isto a sinopse reaparecia aberta ao voltar.
    return () => {
      clearTimeout(timer.current);
      setSelected(null);
    };
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (selected && !d.open) d.showModal();
    else if (!selected && d.open) d.close();
    // um modal aberto dentro de uma tela escondida continuaria bloqueando a página que está à frente
    return () => {
      if (d.open) d.close();
    };
  }, [selected]);

  return (
    <>
      <Lane id="em-alta" label="Animes em Alta" count={items.length} onPointerLeave={(e: PointerEvent) => e.pointerType === "mouse" && open(null, 260)}>
        {cards.map(([a, card]) => {
          const key = `em-alta:${a.id}`;
          return (
            <CaseTile
              key={key}
              t={card}
              tileKey={key}
              caption={caption(a)}
              open={openKey === key}
              onClick={() => { open(key); setSelected(a); }}
              onPointerEnter={(e: PointerEvent) => e.pointerType === "mouse" && open(key, 150)}
              onFocus={(e) => (e.currentTarget as HTMLElement).matches(":focus-visible") && open(key)}
            />
          );
        })}
      </Lane>

      <dialog
        ref={dialog}
        onClose={() => setSelected(null)}
        onClick={(e) => e.target === dialog.current && setSelected(null)}
        aria-labelledby="em-alta-titulo"
        className="m-auto w-[min(720px,calc(100vw-32px))] max-w-none rounded-md border border-border bg-surface p-0 text-foreground backdrop:bg-black/75"
      >
        {selected && (
          <div className="flex max-h-[85vh] flex-col gap-5 overflow-y-auto p-5 sm:flex-row sm:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- capa vinda do AniList */}
            <img src={selected.poster} alt="" className="mx-auto aspect-[2/3] w-40 shrink-0 self-start rounded object-cover sm:mx-0 sm:w-48" />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h2 id="em-alta-titulo" className="text-2xl font-black leading-tight tracking-tight">{selected.name}</h2>
                {selected.searchName !== selected.name && <p className="text-sm text-muted">{selected.searchName}</p>}
              </div>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                {selected.rating != null && <span className="font-bold text-foreground">★ {selected.rating.toFixed(1)}</span>}
                <span>{STATUS[selected.status] ?? selected.status}</span>
                {selected.year && <span>{selected.year}</span>}
                {selected.episodes ? <span>{selected.episodes} ep.</span> : selected.aired ? <span>{selected.aired} ep. exibidos</span> : null}
                {selected.studio && <span>{selected.studio}</span>}
              </p>
              {selected.genres.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Gêneros">
                  {selected.genres.map((g) => <li key={g} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">{g}</li>)}
                </ul>
              )}
              {selected.overview && <p className="whitespace-pre-line text-sm leading-relaxed text-[#c9c7c2]">{selected.overview}</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <Link
                  href={`/nyaa?q=${encodeURIComponent(selected.searchName)}`}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // abrir em nova aba segue o link normal
                    e.preventDefault();
                    setSelected(null);
                    // `n` torna cada clique uma busca nova: a página do Nyaa fica montada e, sem isso, mostraria a pesquisa anterior
                    router.push(`/nyaa?q=${encodeURIComponent(selected.searchName)}&n=${Date.now()}`);
                  }}
                  className="rounded-[3px] bg-foreground px-5 py-2.5 text-sm font-extrabold text-black hover:bg-white"
                >
                  Buscar no Nyaa
                </Link>
                <button type="button" onClick={() => setSelected(null)} className="rounded-[3px] border border-border px-5 py-2.5 text-sm font-bold text-muted hover:text-white">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
