import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Carousel } from "@/components/Carousel";
import { ContinueRow } from "@/components/ContinueRow";
import { PosterCard } from "@/components/PosterCard";
import { CATEGORY_LABEL, getTitleWithEpisodes, listTitles, type TitleRow } from "@/lib/catalog";
import { db, libraryFolders, type Category } from "@/lib/db";
import { sized } from "@/lib/images";
import { listContinueWatching } from "@/lib/progress";
import { getScanState } from "@/lib/scanner/state";

const CATEGORIES: Category[] = ["movie", "series", "anime"];
const PER_ROW = 20;

export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

/** Melhor nota primeiro; sem nota por último, em ordem alfabética. */
const byRating = (a: TitleRow, b: TitleRow) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name, "pt-BR");

async function HomeContent() {
  await connection();
  const all = listTitles();

  if (all.length === 0 && getScanState().running) {
    return (
      <div className="mx-auto max-w-xl rounded border border-dashed border-border p-10 text-center" role="status">
        <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden />
        <h1 className="mb-1 text-xl font-semibold">Varredura em andamento</h1>
        <p className="text-sm text-neutral-400">Os títulos aparecem aqui assim que forem encontrados.</p>
      </div>
    );
  }

  if (all.length === 0) {
    const hasFolder = db.select().from(libraryFolders).limit(1).get() !== undefined;
    return (
      <div className="mx-auto max-w-xl rounded border border-dashed border-border p-10 text-center">
        <h1 className="mb-2 text-xl font-semibold">{hasFolder ? "Seu catálogo está vazio" : "Bem-vindo ao seu streaming"}</h1>
        <p className="mb-5 text-sm text-neutral-400">
          {hasFolder ? "Rode a varredura para encontrar seus vídeos." : "Comece cadastrando a pasta onde estão seus filmes, séries e animes."}
        </p>
        <Link href="/configuracoes" className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-white">
          {hasFolder ? "Escanear agora" : "Configurar pasta"}
        </Link>
      </div>
    );
  }

  const featured = all.filter((t) => t.backdropUrl).sort(byRating)[0];
  const featuredEp = featured ? getTitleWithEpisodes(featured.id)?.episodes[0] : undefined;
  const continueItems = listContinueWatching();

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      {featured && (
        <section className="relative -mx-4 -mt-6 overflow-hidden sm:-mx-8 lg:mx-0 lg:mt-0 lg:rounded-lg" aria-label="Destaque">
          {/* eslint-disable-next-line @next/next/no-img-element -- backdrop externo em qualidade original */}
          <img src={sized(featured.backdropUrl, "original")!} alt="" decoding="async" fetchPriority="high" className="aspect-[16/10] w-full object-cover sm:aspect-[21/9]" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 space-y-3 p-4 sm:p-8">
            <p className="inline-block rounded bg-accent px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">{CATEGORY_LABEL[featured.category]}</p>
            <h1 className="max-w-2xl text-2xl font-bold sm:text-4xl">{featured.name}</h1>
            {featured.overview && <p className="line-clamp-2 max-w-2xl text-sm text-neutral-200 sm:line-clamp-3 sm:text-base">{featured.overview}</p>}
            <div className="flex gap-3">
              {featuredEp && (
                <Link href={`/assistir/${featuredEp.id}`} className="rounded bg-accent px-5 py-2 text-sm font-medium text-white sm:px-6 sm:py-2.5">▶ Assistir</Link>
              )}
              <Link href={`/titulo/${featured.id}`} className="rounded bg-white/15 px-5 py-2 text-sm font-medium backdrop-blur hover:bg-white/25 sm:px-6 sm:py-2.5">Detalhes</Link>
            </div>
          </div>
        </section>
      )}

      <ContinueRow items={continueItems} />

      {CATEGORIES.map((c) => {
        const rows = all.filter((t) => t.category === c).sort(byRating);
        if (rows.length === 0) return null;
        return (
          <Carousel key={c} id={`cat-${c}`} title={CATEGORY_LABEL[c]} href={`/catalogo?categoria=${c}`}>
            {rows.slice(0, PER_ROW).map((t) => (
              <li key={t.id} className="w-32 shrink-0 snap-start sm:w-40 lg:w-44">
                <PosterCard id={t.id} name={t.name} year={t.year} posterUrl={t.posterUrl} rating={t.rating} />
              </li>
            ))}
          </Carousel>
        );
      })}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-10" aria-busy="true" aria-label="Carregando">
      <div className="aspect-[21/9] animate-pulse rounded-lg bg-surface" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[2/3] w-40 shrink-0 animate-pulse rounded bg-surface" />)}
      </div>
    </div>
  );
}
