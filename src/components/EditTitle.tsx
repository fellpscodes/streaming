"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Category, MetadataStatus } from "@/lib/db/schema";

interface Props {
  id: number;
  name: string;
  year: number | null;
  category: Category;
  metadataStatus: MetadataStatus;
}

const inputCls = "rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

/** Corrige nome/ano/categoria de qualquer título e refaz a busca da capa e da sinopse. */
export function EditTitle({ id, name: n0, year: y0, category: c0, metadataStatus }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(metadataStatus === "not_found");
  const [name, setName] = useState(n0);
  const [year, setYear] = useState(y0?.toString() ?? "");
  const [category, setCategory] = useState<Category>(c0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/titles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, year: year.trim() ? Number(year) : null, category }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Erro ao salvar.");
      return setBusy(false);
    }
    await fetch("/api/scan?only=metadata", { method: "POST" });
    // Espera a busca terminar (poucos segundos) para recarregar já com a capa nova.
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const s = await (await fetch("/api/scan")).json();
      if (!s.running) break;
    }
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded border border-border px-4 py-2.5 text-sm hover:border-accent">
        Corrigir título
      </button>
    );

  return (
    <form onSubmit={save} className="w-full space-y-2 rounded border border-border bg-surface/90 p-3">
      {metadataStatus === "not_found" && (
        <p className="text-sm text-amber-400">Nenhum metadado encontrado. Ajuste o nome (de preferência o original) e busque de novo.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 basis-48 text-xs text-neutral-400">
          Nome para busca
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
        <button disabled={busy || !name.trim()} className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Buscando…" : "Salvar e buscar"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="px-2 py-1.5 text-sm text-neutral-400">Cancelar</button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
