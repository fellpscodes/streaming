import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import "@/components/disc/disc.css";
import { EditTitle } from "@/components/EditTitle";
import { CATEGORY_LABEL } from "@/lib/category";
import { getTitleWithEpisodes, seasonsOf } from "@/lib/catalog";
import { fileTitle } from "@/lib/episodes";
import { posterSrcSet, sized } from "@/lib/images";
import { listContinueWatching } from "@/lib/progress";

export default function TituloPage(props: PageProps<"/titulo/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded bg-surface" aria-busy="true" aria-label="Carregando" />}>
      <Titulo params={props.params} />
    </Suspense>
  );
}

async function Titulo({ params }: { params: PageProps<"/titulo/[id]">["params"] }) {
  await connection();
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? getTitleWithEpisodes(id) : null;
  if (!data) notFound();
  const { title: t, episodes } = data;

  const first = episodes[0];
  const cont = listContinueWatching(t.id)[0];
  const seasons = t.category === "movie" ? [] : seasonsOf(episodes);
  const backdrop = sized(t.backdropUrl, "original");

  return (
    <article>
      <div className="dc-banner">
        {/* eslint-disable-next-line @next/next/no-img-element -- backdrop externo em qualidade original */}
        {backdrop && <img className="bg" src={backdrop} alt="" decoding="async" />}
        <div className="in">
          <div className="dc-hcase dc-bigcase" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- capa em CDN externo */}
            {t.posterUrl && <img src={sized(t.posterUrl, "w780") ?? undefined} srcSet={posterSrcSet(t.posterUrl)} sizes="300px" alt="" />}
          </div>
          <div className="min-w-0 space-y-4">
            <div className="dc-hk">
              <span className="dc-tag">{CATEGORY_LABEL[t.category].replace(/s$/, "")}</span>
            </div>
            <h1 className="text-[clamp(34px,5vw,68px)] font-black leading-[0.95] tracking-[-0.05em] [text-wrap:balance]">{t.name}</h1>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[15px] text-[#d8d6d1]">
              {t.rating != null && <span className="font-extrabold text-white">{t.rating.toFixed(1).replace(".", ",")}</span>}
              {t.year && <span>{t.year}</span>}
              {t.category !== "movie" && <span>{episodes.length} episódio(s)</span>}
            </p>
            {t.genres && t.genres.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {t.genres.map((g) => (
                  <li key={g}>
                    <Link href={`/catalogo?categoria=${t.category}&genero=${encodeURIComponent(g)}`} className="rounded-[3px] border border-white/40 px-3 py-1 text-xs font-medium text-[#d8d6d1] hover:border-white hover:text-white">
                      {g}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="max-w-[62ch] leading-relaxed text-[#d8d6d1]">
              {t.overview ?? (t.metadataStatus === "pending" ? "Metadados ainda não buscados." : "Sem sinopse disponível.")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {first ? (
                <Link href={`/assistir/${(cont ?? { episodeId: first.id }).episodeId}`} className="dc-btn-play">
                  <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" /></svg>
                  {cont ? `${cont.positionSec > 0 ? "Continuar" : "Próximo"}${cont.isMovie || !cont.numbered ? "" : ` ${cont.label}`}` : "Assistir"}
                </Link>
              ) : (
                <span className="text-sm text-muted">Nenhum arquivo de vídeo.</span>
              )}
              <EditTitle id={t.id} name={t.name} year={t.year} category={t.category} metadataStatus={t.metadataStatus} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] space-y-10 py-8">
        {t.cast && t.cast.length > 0 && (
          <section>
            <h2 className="mb-3 text-xl font-extrabold tracking-[-0.025em]">Elenco</h2>
            <ul tabIndex={0} aria-label="Elenco" className="flex gap-4 overflow-x-auto pb-2">
              {t.cast.map((c) => (
                <li key={`${c.name}-${c.role}`} className="w-24 shrink-0 text-center">
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto externa
                    <img src={c.photoUrl} alt={c.name} loading="lazy" className="mx-auto size-20 rounded-full object-cover" />
                  ) : (
                    <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-surface text-xl text-muted">{c.name[0]}</div>
                  )}
                  <p className="mt-2 text-xs font-bold">{c.name}</p>
                  {c.role && <p className="text-xs text-muted">{c.role}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {seasons.map((s) => (
          <section key={s.season ?? "x"} aria-labelledby={`temp-${s.season ?? "x"}`}>
            <h2 id={`temp-${s.season ?? "x"}`} className="mb-3 text-xl font-extrabold tracking-[-0.025em]">
              {s.season != null ? `Temporada ${s.season}` : seasons.length === 1 ? "Episódios" : "Outros arquivos"}
            </h2>
            <ul className="divide-y divide-border border-y border-border">
              {s.episodes.map((e, i) => (
                <li key={e.id}>
                  <Link href={`/assistir/${e.id}`} className="group flex items-center gap-4 px-2 py-3 hover:bg-white/5">
                    <span className="w-10 shrink-0 text-center text-xl font-black tabular-nums text-muted group-hover:text-white">{e.episode ?? i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px]" title={e.filePath}>{fileTitle(e.filePath)}</span>
                    <svg viewBox="0 0 14 14" className="size-4 shrink-0 fill-current text-muted group-hover:text-white" aria-hidden="true"><path d="M3 1.5v11l9.5-5.5z" /></svg>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
