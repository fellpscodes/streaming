"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category } from "@/lib/db/schema";

interface Ep {
  id: number;
  filePath: string;
  season: number | null;
  episode: number | null;
}
interface ReviewTitle {
  id: number;
  name: string;
  year: number | null;
  category: Category;
  reviewReason: string | null;
  episodes: Ep[];
}

const inputCls = "rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent";
const btnCls = "rounded bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-50";
const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;
const toNum = (v: string) => (v.trim() === "" ? null : Number(v));

export function ReviewClient() {
  const [items, setItems] = useState<ReviewTitle[] | null>(null);

  const load = useCallback(async () => {
    setItems(await (await fetch("/api/review")).json());
  }, []);
  useEffect(() => {
    fetch("/api/review").then((r) => r.json()).then(setItems);
  }, []);

  if (items === null) return <p className="text-sm text-neutral-400">Carregando…</p>;
  if (items.length === 0)
    return (
      <div className="rounded border border-dashed border-border p-8 text-center text-sm text-neutral-400">
        Nada para corrigir. Todos os títulos foram reconhecidos.
      </div>
    );

  return (
    <ul className="space-y-6">
      {items.map((t) => (
        <TitleCard key={t.id} title={t} onSaved={load} />
      ))}
    </ul>
  );
}

function TitleCard({ title, onSaved }: { title: ReviewTitle; onSaved: () => void }) {
  const [name, setName] = useState(title.name);
  const [year, setYear] = useState(title.year?.toString() ?? "");
  const [category, setCategory] = useState<Category>(title.category);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch(`/api/titles/${title.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, year: toNum(year), category }),
    });
    setBusy(false);
    onSaved();
  }

  return (
    <li className="space-y-3 rounded border border-border bg-surface p-4">
      <p className="text-sm text-amber-400">{title.reviewReason}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 text-xs text-neutral-400">
          Título
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1 block w-full`} />
        </label>
        <label className="w-24 text-xs text-neutral-400">
          Ano
          <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" className={`${inputCls} mt-1 block w-full`} />
        </label>
        <label className="text-xs text-neutral-400">
          Categoria
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={`${inputCls} mt-1 block`}>
            <option value="movie">Filme</option>
            <option value="series">Série</option>
            <option value="anime">Anime</option>
          </select>
        </label>
        <button onClick={save} disabled={busy || !name.trim()} className={btnCls}>
          Salvar título
        </button>
      </div>

      {category !== "movie" && (
        <ul className="divide-y divide-border">
          {title.episodes.map((e) => (
            <EpisodeRow key={e.id} ep={e} onSaved={onSaved} />
          ))}
        </ul>
      )}
      {category === "movie" && title.episodes.length > 1 && (
        <p className="text-sm text-neutral-400">
          Este título tem {title.episodes.length} vídeos; mude a categoria para Série/Anime para numerar os episódios.
        </p>
      )}
    </li>
  );
}

function EpisodeRow({ ep, onSaved }: { ep: Ep; onSaved: () => void }) {
  const [season, setSeason] = useState(ep.season?.toString() ?? "");
  const [episode, setEpisode] = useState(ep.episode?.toString() ?? "");

  async function save() {
    await fetch(`/api/episodes/${ep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ season: toNum(season), episode: toNum(episode) }),
    });
    onSaved();
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-300" title={ep.filePath}>
        {basename(ep.filePath)}
      </span>
      <input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="T" aria-label="Temporada" inputMode="numeric" className={`${inputCls} w-14`} />
      <input value={episode} onChange={(e) => setEpisode(e.target.value)} placeholder="Ep" aria-label="Episódio" inputMode="numeric" className={`${inputCls} w-14`} />
      <button onClick={save} className={btnCls}>Salvar</button>
    </li>
  );
}
