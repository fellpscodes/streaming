import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { EditTitle } from "@/components/EditTitle";
import { Poster } from "@/components/Poster";
import { CATEGORY_LABEL, getTitleWithEpisodes, seasonsOf } from "@/lib/catalog";
import { fileTitle } from "@/lib/episodes";
import { sized } from "@/lib/images";
import { listContinueWatching } from "@/lib/progress";

export default function TituloPage(props: PageProps<"/titulo/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded bg-surface" aria-busy="true" />}>
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
    <article className="-mx-4 -my-6 sm:-mx-8">
      <div className="relative">
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element -- backdrop externo em qualidade original
          <img src={backdrop} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-8 pt-10 sm:flex-row sm:px-8 sm:pt-16">
          <Poster src={t.posterUrl} title={t.name} variant="hero" className="w-44 shrink-0 self-center rounded-md shadow-2xl sm:w-64 sm:self-start" />
          <div className="space-y-4">
            <p className="text-sm uppercase tracking-wide text-accent-fg">{CATEGORY_LABEL[t.category]}</p>
            <h1 className="text-3xl font-bold sm:text-4xl">{t.name}</h1>
            <p className="flex flex-wrap gap-x-4 text-sm text-neutral-300">
              {t.year && <span>{t.year}</span>}
              {t.rating != null && <span>★ {t.rating.toFixed(1)}</span>}
              {t.category !== "movie" && <span>{episodes.length} episódio(s)</span>}
            </p>
            {t.genres && t.genres.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {t.genres.map((g) => (
                  <li key={g}>
                    <Link href={`/catalogo?categoria=${t.category}&genero=${encodeURIComponent(g)}`} className="rounded-full border border-border px-3 py-0.5 text-xs text-neutral-300 hover:border-accent">
                      {g}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="max-w-3xl leading-relaxed text-neutral-200">
              {t.overview ?? (t.metadataStatus === "pending" ? "Metadados ainda não buscados." : "Sem sinopse disponível.")}
            </p>
            <div className="flex flex-wrap gap-3">
              {first ? (
                <Link href={`/assistir/${(cont ?? { episodeId: first.id }).episodeId}`} className="rounded bg-accent px-6 py-2.5 font-medium text-white">
                  {cont
                    ? `▶ ${cont.positionSec > 0 ? "Continuar" : "Próximo"}${cont.isMovie || !cont.numbered ? "" : ` ${cont.label}`}`
                    : "▶ Assistir"}
                </Link>
              ) : (
                <span className="text-sm text-neutral-400">Nenhum arquivo de vídeo.</span>
              )}
              <EditTitle id={t.id} name={t.name} year={t.year} category={t.category} metadataStatus={t.metadataStatus} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-8">
        {t.cast && t.cast.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold">Elenco</h2>
            <ul tabIndex={0} aria-label="Elenco" className="flex gap-4 overflow-x-auto pb-2">
              {t.cast.map((c) => (
                <li key={`${c.name}-${c.role}`} className="w-24 shrink-0 text-center">
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto externa
                    <img src={c.photoUrl} alt={c.name} loading="lazy" className="mx-auto size-20 rounded-full object-cover" />
                  ) : (
                    <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-surface text-xl text-neutral-400">{c.name[0]}</div>
                  )}
                  <p className="mt-2 text-xs font-medium">{c.name}</p>
                  {c.role && <p className="text-xs text-neutral-400">{c.role}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {seasons.map((s) => (
          <section key={s.season ?? "x"} aria-labelledby={`temp-${s.season ?? "x"}`}>
            <h2 id={`temp-${s.season ?? "x"}`} className="mb-3 text-lg font-semibold">
              {s.season != null ? `Temporada ${s.season}` : seasons.length === 1 ? "Episódios" : "Outros arquivos"}
            </h2>
            <ul className="divide-y divide-border rounded border border-border bg-surface">
              {s.episodes.map((e, i) => (
                <li key={e.id}>
                  <Link href={`/assistir/${e.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-border/40">
                    <span className="w-10 shrink-0 text-center text-lg font-semibold text-neutral-400">{e.episode ?? i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm" title={e.filePath}>{fileTitle(e.filePath)}</span>
                    <span className="text-accent-fg">▶</span>
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
