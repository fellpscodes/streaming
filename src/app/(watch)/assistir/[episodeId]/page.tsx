import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { discLabel } from "@/components/disc/DiscArt";
import { Player } from "@/components/Player";
import { getTitleWithEpisodes } from "@/lib/catalog";
import { episodeLabel } from "@/lib/episodes";
import { episodeFile } from "@/lib/media/episode";
import { getProgress } from "@/lib/progress";

export const metadata = { title: "Assistir · Streaming" };

export default function AssistirPage(props: PageProps<"/assistir/[episodeId]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 animate-pulse bg-black" aria-busy="true" aria-label="Carregando" />}>
      <Assistir params={props.params} />
    </Suspense>
  );
}

async function Assistir({ params }: { params: PageProps<"/assistir/[episodeId]">["params"] }) {
  await connection();
  const ep = episodeFile(Number((await params).episodeId));
  if (!ep) notFound();
  const { title, episodes } = getTitleWithEpisodes(ep.titleId)!;
  const idx = episodes.findIndex((e) => e.id === ep.id);
  const next = episodes[idx + 1];
  const prev = idx > 0 ? episodes[idx - 1] : undefined;
  const prog = getProgress(ep.id);
  const isMovie = title.category === "movie";

  return (
    <Player
      key={ep.id} // remonta ao trocar de episódio: nada do anterior (vídeo, legenda) sobra na tela
      episodeId={ep.id}
      title={title.name}
      subtitle={isMovie ? (title.year ? String(title.year) : "") : episodeLabel(ep)}
      backHref={`/titulo/${title.id}`}
      prevHref={prev ? `/assistir/${prev.id}` : null}
      nextHref={next ? `/assistir/${next.id}` : null}
      startAt={prog && !prog.completed ? prog.positionSec : 0}
      cover={title.posterUrl}
      discText={discLabel(title)}
    />
  );
}
