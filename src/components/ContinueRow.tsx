import Link from "next/link";
import type { ContinueEntry } from "@/lib/progress";
import { sized } from "@/lib/images";
import { Poster } from "./Poster";

export function ContinueRow({ items }: { items: ContinueEntry[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="continuar">
      <h2 id="continuar" className="mb-3 text-lg font-semibold">Continuar assistindo</h2>
      <ul aria-labelledby="continuar" className="flex gap-4 overflow-x-auto pb-3">
        {items.map((c) => {
          const pct = c.durationSec ? Math.min(100, (c.positionSec / c.durationSec) * 100) : 0;
          const img = sized(c.backdropUrl, "w780");
          return (
            <li key={c.titleId} className="w-64 shrink-0 sm:w-72">
              <Link href={`/assistir/${c.episodeId}`} className="group block overflow-hidden rounded-md bg-surface ring-accent focus-visible:ring-2 sm:hover:ring-2">
                <div className="relative aspect-video">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element -- backdrop externo
                    <img src={img} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <Poster src={c.posterUrl} title={c.name} className="size-full !aspect-auto" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-3xl opacity-0 transition group-hover:opacity-100">▶</span>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="p-2">
                  <p className="truncate text-sm font-medium" title={c.name}>{c.name}</p>
                  <p className="text-xs text-neutral-400">
                    {c.isMovie ? "Filme" : `T${c.season ?? "?"} · E${c.episode ?? "?"}`}
                    {c.positionSec > 0 ? " · continuar" : " · próximo"}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
