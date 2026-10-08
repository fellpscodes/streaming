"use client";

import { useEffect, useState } from "react";
import type { FolderKind } from "@/lib/db/schema";

interface Listing {
  path: string;
  parent: string | null;
  dirs: string[];
}

export const KIND_LABEL: Record<FolderKind, string> = {
  auto: "Automático (detectar)",
  movie: "Só filmes",
  series: "Só séries",
  anime: "Só animes",
};

interface Props {
  onPick: (path: string, kind: FolderKind) => Promise<string | null>; // devolve mensagem de erro, se houver
  onCancel: () => void;
}

/** Navega pelas pastas do computador e escolhe a pasta-mãe (a que tem uma subpasta por título). */
export function FolderPicker({ onPick, onCancel }: Props) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [typed, setTyped] = useState("");
  const [kind, setKind] = useState<FolderKind>("auto");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(p?: string) {
    setError(null);
    const res = await fetch(`/api/fs${p ? `?path=${encodeURIComponent(p)}` : ""}`);
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "Não foi possível abrir a pasta.");
    setListing(data);
    setTyped(data.path);
  }

  useEffect(() => {
    fetch("/api/fs")
      .then((r) => r.json())
      .then((d: Listing & { error?: string }) => {
        if (d.error) return setError(d.error);
        setListing(d);
        setTyped(d.path);
      });
  }, []);

  async function confirm() {
    if (!listing) return;
    setBusy(true);
    const err = await onPick(listing.path, kind);
    setBusy(false);
    if (err) setError(err);
  }

  const join = (name: string) => `${listing!.path.replace(/\/$/, "")}/${name}`;
  const field = "rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-3 rounded border border-border bg-surface p-4" role="group" aria-label="Escolher pasta-mãe">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void go(typed);
        }}
        className="flex gap-2"
      >
        <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Caminho da pasta" spellCheck={false} className={`${field} min-w-0 flex-1 font-mono`} />
        <button className="rounded border border-border px-3 py-1.5 text-sm hover:border-accent">Ir</button>
      </form>

      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded border border-border" aria-label="Subpastas">
        {listing?.parent && (
          <li>
            <button onClick={() => go(listing.parent!)} className="w-full px-3 py-2 text-left text-sm text-neutral-300 hover:bg-border/40">
              ⬆ Pasta acima
            </button>
          </li>
        )}
        {listing?.dirs.map((d) => (
          <li key={d}>
            <button onClick={() => go(join(d))} className="w-full truncate px-3 py-2 text-left text-sm hover:bg-border/40">
              📁 {d}
            </button>
          </li>
        ))}
        {listing && listing.dirs.length === 0 && <li className="px-3 py-3 text-sm text-neutral-400">Nenhuma subpasta aqui.</li>}
        {!listing && !error && <li className="px-3 py-3 text-sm text-neutral-400">Carregando…</li>}
      </ul>

      <label className="block text-xs text-neutral-400">
        O que há dentro desta pasta?
        <select value={kind} onChange={(e) => setKind(e.target.value as FolderKind)} className={`${field} mt-1 block w-full sm:w-72`}>
          {(Object.keys(KIND_LABEL) as FolderKind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
      </label>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={confirm} disabled={!listing || busy} className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Adicionando…" : "Usar esta pasta"}
        </button>
        <button onClick={onCancel} className="px-3 py-2 text-sm text-neutral-400 hover:text-white">Cancelar</button>
        {listing && <span className="min-w-0 truncate font-mono text-xs text-neutral-400">{listing.path}</span>}
      </div>
    </div>
  );
}
