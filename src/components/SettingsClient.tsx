"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ScanState } from "@/lib/scanner/state";

interface Folder {
  id: number;
  path: string;
}

export function SettingsClient() {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState | null>(null);

  const loadFolders = useCallback(async () => {
    setFolders(await (await fetch("/api/folders")).json());
  }, []);

  useEffect(() => {
    fetch("/api/folders").then((r) => r.json()).then(setFolders);
    const es = new EventSource("/api/scan/events");
    es.onmessage = (e) => setScan(JSON.parse(e.data));
    return () => es.close();
  }, []);

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) return setError((await res.json()).error ?? "Erro ao adicionar.");
    setPath("");
    void loadFolders();
  }

  async function removeFolder(id: number) {
    if (!confirm("Remover esta pasta e os títulos dela do catálogo? Os arquivos no disco não são afetados.")) return;
    await fetch(`/api/folders?id=${id}`, { method: "DELETE" });
    void loadFolders();
  }

  const running = scan?.running ?? false;
  const pct = scan && (scan.phase === "saving" || scan.phase === "metadata") && scan.total ? Math.round((scan.processed / scan.total) * 100) : null;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Pastas-mãe</h2>
        <form onSubmit={addFolder} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/midia"
            className="flex-1 rounded border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
          <button className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!path.trim()}>
            Adicionar
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

        <ul className="mt-4 space-y-2">
          {folders === null && <li className="text-sm text-neutral-400">Carregando…</li>}
          {folders?.length === 0 && (
            <li className="rounded border border-dashed border-border p-6 text-center text-sm text-neutral-400">
              Nenhuma pasta configurada. Adicione a pasta que contém uma subpasta por título.
            </li>
          )}
          {folders?.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 rounded border border-border bg-surface px-3 py-2">
              <span className="truncate font-mono text-sm">{f.path}</span>
              <button onClick={() => removeFolder(f.id)} className="text-sm text-neutral-400 hover:text-red-400">
                Remover
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Varredura</h2>
        <button
          onClick={() => fetch("/api/scan", { method: "POST" })}
          disabled={running || !folders?.length}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {running ? "Escaneando…" : "Escanear agora"}
        </button>

        {scan && scan.phase !== "idle" && (
          <div className="mt-4 space-y-2" aria-live="polite">
            <div className="h-2 overflow-hidden rounded bg-surface">
              <div
                className={`h-full bg-accent transition-all ${pct === null && running ? "w-1/3 animate-pulse" : ""}`}
                style={pct !== null || !running ? { width: `${scan.phase === "done" ? 100 : (pct ?? 0)}%` } : undefined}
              />
            </div>
            <p className="text-sm text-neutral-300">
              {scan.phase === "walking" && `Procurando arquivos… ${scan.filesFound} encontrados`}
              {scan.phase === "saving" && `Processando ${scan.processed}/${scan.total}${scan.current ? ` · ${scan.current}` : ""}`}
              {scan.phase === "metadata" && `Buscando capas e sinopses ${scan.processed}/${scan.total}${scan.current ? ` · ${scan.current}` : ""}`}
              {scan.phase === "done" && `Concluído: ${scan.filesFound} arquivos.`}
              {scan.phase === "error" && <span className="text-red-400">Erro: {scan.error}</span>}
            </p>
            {scan.warnings.map((w) => (
              <p key={w} className="text-sm text-amber-400">{w}</p>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Correção manual</h2>
        <p className="mb-3 text-sm text-neutral-400">Títulos que o scanner não conseguiu reconhecer com segurança.</p>
        <Link href="/configuracoes/correcao" className="inline-block rounded border border-border px-4 py-2 text-sm hover:border-accent">
          Revisar títulos
        </Link>
      </section>
    </div>
  );
}
