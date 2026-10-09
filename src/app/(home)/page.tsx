import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { HomeBrowser } from "@/components/disc/HomeBrowser";
import { db, libraryFolders } from "@/lib/db";
import { getHomeData } from "@/lib/home";
import { getScanState } from "@/lib/scanner/state";

export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  await connection();
  const data = getHomeData();

  if (data.titles.length === 0) {
    const scanning = getScanState().running;
    const hasFolder = db.select().from(libraryFolders).limit(1).get() !== undefined;
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 pt-24 text-center" role="status">
        {scanning && <div className="mb-4 size-8 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden />}
        <h1 className="mb-2 text-3xl font-black tracking-tight">
          {scanning ? "Varredura em andamento" : hasFolder ? "Seu catálogo está vazio" : "Bem-vindo ao seu streaming"}
        </h1>
        <p className="mb-6 text-sm text-muted">
          {scanning
            ? "Os títulos aparecem aqui assim que forem encontrados."
            : hasFolder
              ? "Rode a varredura para encontrar seus vídeos."
              : "Comece cadastrando a pasta onde estão seus filmes, séries e animes."}
        </p>
        {!scanning && (
          <Link href="/configuracoes" className="rounded-[3px] bg-foreground px-5 py-2.5 text-sm font-extrabold text-black">
            {hasFolder ? "Escanear agora" : "Configurar pasta"}
          </Link>
        )}
      </div>
    );
  }
  return <HomeBrowser data={data} />;
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="h-[54vh] animate-pulse bg-surface" />
      <div className="flex gap-3 overflow-hidden px-[var(--gut)] pt-8">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[142/125] w-[160px] shrink-0 animate-pulse rounded bg-surface" />)}
      </div>
    </div>
  );
}
