"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FolderKind } from "@/lib/db/schema";
import type { ScanState } from "@/lib/scanner/state";
import { FolderPicker, KIND_LABEL } from "./FolderPicker";

interface Folder {
  id: number;
  path: string;
  kind: FolderKind;
  titleCount: number;
}

export function SettingsClient({ tmdbConfigured }: { tmdbConfigured: boolean }) {
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    setFolders(await (await fetch("/api/folders")).json());
  }, []);

  useEffect(() => {
    fetch("/api/folders").then((r) => r.json()).then(setFolders);
    fetch("/api/version")
      .then((r) => r.json())
      .then((v: { mode: string; builtAt: string | null }) =>
        setVersion(v.builtAt ? `build de ${new Date(v.builtAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : v.mode),
      )
      .catch(() => {});
    const es = new EventSource("/api/scan/events");
    es.onmessage = (e) => {
      const s: ScanState = JSON.parse(e.data);
      setScan(s);
      if (s.phase === "done") fetch("/api/folders").then((r) => r.json()).then(setFolders); // contagens novas
    };
    return () => es.close();
  }, []);

  const startScan = () => fetch("/api/scan", { method: "POST" });

  /** Devolve a mensagem de erro para o seletor mostrar; null = adicionou e já começa a varredura. */
  async function addFolder(path: string, kind: FolderKind): Promise<string | null> {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, kind }),
    });
    if (!res.ok) return (await res.json()).error ?? "Erro ao adicionar.";
    setPicking(false);
    await loadFolders();
    void startScan();
    return null;
  }

  async function changeKind(id: number, kind: FolderKind) {
    await fetch("/api/folders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, kind }) });
    await loadFolders();
    void startScan(); // reclassifica os títulos desta pasta
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
      {!tmdbConfigured && (
        <div role="alert" className="rounded border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-200">
          <strong>Chave do TMDB não configurada.</strong> Filmes e séries ficam sem capa e sinopse. Defina{" "}
          <code className="rounded bg-black/40 px-1">TMDB_API_KEY</code> (ou <code className="rounded bg-black/40 px-1">TMDB_READ_TOKEN</code>) no
          arquivo <code className="rounded bg-black/40 px-1">.env.local</code> e reinicie o servidor. Animes funcionam sem chave.
        </div>
      )}
      <section>
        <h2 className="mb-3 text-xl font-extrabold tracking-[-0.025em]">Pastas-mãe</h2>
        {picking ? (
          <FolderPicker onPick={addFolder} onCancel={() => setPicking(false)} />
        ) : (
          <button onClick={() => setPicking(true)} className="rounded bg-accent px-4 py-2 text-sm font-medium text-white">
            + Adicionar pasta
          </button>
        )}

        <ul className="mt-4 space-y-2">
          {folders === null && <li className="text-sm text-neutral-400">Carregando…</li>}
          {folders?.length === 0 && !picking && (
            <li className="rounded border border-dashed border-border p-6 text-center text-sm text-neutral-400">
              Nenhuma pasta configurada. Adicione a pasta que contém uma subpasta por título.
            </li>
          )}
          {folders?.map((f) => (
            <li key={f.id} className="space-y-2 rounded border border-border bg-surface px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm" title={f.path}>{f.path}</p>
                  <p className="text-xs text-neutral-400">{f.titleCount} título(s)</p>
                </div>
                <button onClick={() => removeFolder(f.id)} className="shrink-0 text-sm text-neutral-400 hover:text-red-400">
                  Remover
                </button>
              </div>
              <label className="block text-xs text-neutral-400">
                Conteúdo
                <select
                  value={f.kind}
                  onChange={(e) => changeKind(f.id, e.target.value as FolderKind)}
                  className="ml-2 rounded border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
                >
                  {(Object.keys(KIND_LABEL) as FolderKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-extrabold tracking-[-0.025em]">Varredura</h2>
        <button
          onClick={startScan}
          disabled={running || !folders?.length}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {running ? "Escaneando…" : "Escanear agora"}
        </button>

        {scan && scan.phase !== "idle" && (
          <div className="mt-4 space-y-2" aria-live="polite">
            <div className="h-2 overflow-hidden rounded bg-surface" role="progressbar" aria-label="Progresso da varredura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scan.phase === "done" ? 100 : (pct ?? undefined)}>
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
        <h2 className="mb-3 text-xl font-extrabold tracking-[-0.025em]">Correção manual</h2>
        <p className="mb-3 text-sm text-neutral-400">Títulos que o scanner não conseguiu reconhecer com segurança.</p>
        <Link href="/configuracoes/correcao" className="inline-block rounded border border-border px-4 py-2 text-sm hover:border-accent">
          Revisar títulos
        </Link>
      </section>
      {version && <p className="text-xs text-muted">Versão em execução: {version}</p>}
    </div>
  );
}
