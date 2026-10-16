"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Cover } from "@/lib/nyaa/covers";
import type { NyaaItem, NyaaPage } from "@/lib/nyaa/parse";
import { refineByLang } from "@/lib/nyaa/release";
import type { NyaaLang, NyaaResolution, NyaaSort } from "@/lib/nyaa/search";
import type { DownloadView } from "@/lib/qbittorrent";

interface QbtStatus {
  connected: boolean;
  version: string | null;
  error: string | null;
  config: { url: string; username: string; hasPassword: boolean };
  folders: Array<{ id: number; path: string; kind: string }>;
  defaultFolderId: number | null;
}

interface Filters {
  q: string;
  lang: NyaaLang;
  res: NyaaResolution;
  sort: NyaaSort;
  trusted: boolean;
}

type Sent = { state: "sending" | "sent" | "exists" | "error"; message?: string };

const LANGS: Array<[NyaaLang, string]> = [
  ["all", "Qualquer idioma"],
  ["en", "Legendado em inglês"],
  ["ptbr-sub", "Legendado em PT-BR"],
  ["ptbr-dub", "Dublado em PT-BR"],
  ["ptbr", "PT-BR (legendado ou dublado)"],
  ["other", "Legendado em outros idiomas"],
  ["raw", "Raw (sem legenda)"],
];
const SORTS: Array<[NyaaSort, string]> = [
  ["auto", "Ordem padrão"],
  ["seeders", "Mais seeders"],
  ["date", "Mais recentes"],
  ["downloads", "Mais baixados"],
  ["size", "Maior tamanho"],
];
const RESOLUTIONS: Array<[NyaaResolution, string]> = [
  ["", "Qualquer resolução"],
  ["2160p", "2160p (4K)"],
  ["1080p", "1080p"],
  ["720p", "720p"],
  ["480p", "480p"],
];

const input = "rounded-[3px] border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground";
const btn = "rounded-[3px] bg-foreground px-4 py-2 text-sm font-extrabold text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-50";
const ghost = "rounded-[3px] border border-border px-3 py-2 text-sm font-bold text-muted hover:text-white disabled:opacity-50";

const fmtBytes = (n: number) => {
  const u = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i > 1 ? 1 : 0)} ${u[i]}`;
};
const fmtEta = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export function NyaaClient({ initialQuery }: { initialQuery: string }) {
  const [filters, setFilters] = useState<Filters>({ q: initialQuery, lang: "all", res: "", sort: "auto", trusted: false });
  const [result, setResult] = useState<NyaaPage | null>(null);
  const [resultLang, setResultLang] = useState<NyaaLang>("all"); // idioma com que `result` foi buscado
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"" | "episode" | "batch">("");
  const [group, setGroup] = useState("");

  const [qbt, setQbt] = useState<QbtStatus | null>(null);
  const [showConn, setShowConn] = useState(false);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [downloads, setDownloads] = useState<DownloadView[]>([]);
  const [downloadsError, setDownloadsError] = useState<string | null>(null);
  const [covers, setCovers] = useState<Record<string, Cover | null>>({});
  const [sent, setSent] = useState<Record<string, Sent>>({});

  const req = useRef(0);
  const coversAsked = useRef(new Set<string>());
  const initialFilters = useRef(filters);

  /** Busca as capas dos animes da página (uma consulta só); a lista aparece antes e as capas entram depois. */
  const loadCovers = useCallback(async (items: NyaaItem[]) => {
    const names = [...new Set(items.map((i) => i.show))].filter((n) => !coversAsked.current.has(n));
    if (names.length === 0) return;
    names.forEach((n) => coversAsked.current.add(n));
    try {
      const res = await fetch("/api/nyaa/covers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names }) });
      if (!res.ok) throw new Error();
      const found = (await res.json()) as Record<string, Cover | null>;
      setCovers((c) => ({ ...c, ...found }));
      names.filter((n) => !(n in found)).forEach((n) => coversAsked.current.delete(n)); // ficou de fora (limite/erro): tenta na próxima busca
    } catch {
      names.forEach((n) => coversAsked.current.delete(n));
    }
  }, []);

  const search = useCallback(async (f: Filters, page = 1) => {
    const id = ++req.current;
    setLoading(true);
    setError(null);
    setKind("");
    setGroup("");
    const p = new URLSearchParams({ q: f.q, lang: f.lang, res: f.res, sort: f.sort, page: String(page) });
    if (f.trusted) p.set("trusted", "1");
    try {
      const res = await fetch(`/api/nyaa/search?${p}`);
      if (!res.ok) throw new Error(await readError(res, "A busca falhou."));
      const data = (await res.json()) as NyaaPage;
      if (id === req.current) { setResult(data); setResultLang(f.lang); void loadCovers(data.items); }
    } catch (e) {
      if (id === req.current) { setError(e instanceof Error ? e.message : "A busca falhou."); setResult(null); }
    } finally {
      if (id === req.current) setLoading(false);
    }
    history.replaceState(null, "", f.q.trim() ? `/nyaa?q=${encodeURIComponent(f.q.trim())}` : "/nyaa");
  }, [loadCovers]);

  const loadQbt = useCallback(async () => {
    const s = (await (await fetch("/api/nyaa/qbittorrent")).json()) as QbtStatus;
    setQbt(s);
    setFolderId((cur) => cur ?? s.defaultFolderId);
    setShowConn(!s.connected);
    return s;
  }, []);

  const loadDownloads = useCallback(async () => {
    try {
      const res = await fetch("/api/nyaa/downloads");
      if (!res.ok) throw new Error(await readError(res, "Não consegui ler os downloads."));
      setDownloads(((await res.json()) as { downloads: DownloadView[] }).downloads);
      setDownloadsError(null);
    } catch (e) {
      setDownloadsError(e instanceof Error ? e.message : "Não consegui ler os downloads.");
    }
  }, []);

  // Primeira busca e checagem do qBittorrent ao abrir a página (adiado um tick; o cleanup evita repetir no modo estrito).
  useEffect(() => {
    const t = setTimeout(() => {
      void search(initialFilters.current);
      void loadQbt();
    }, 0);
    return () => clearTimeout(t);
  }, [search, loadQbt]);

  // Acompanha os downloads enquanto a aba está visível e o qBittorrent responde.
  const connected = qbt?.connected ?? false;
  useEffect(() => {
    if (!connected) return;
    const tick = () => document.visibilityState === "visible" && void loadDownloads();
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 3000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [connected, loadDownloads]);

  function change(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    void search(next);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void search(filters);
  }

  async function download(item: NyaaItem) {
    const key = item.infoHash;
    setSent((s) => ({ ...s, [key]: { state: "sending" } }));
    try {
      const res = await fetch("/api/nyaa/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magnet: item.magnet, title: item.title, folderId }),
      });
      if (!res.ok) throw new Error(await readError(res, "Não foi possível baixar."));
      const r = (await res.json()) as { alreadyAdded: boolean };
      setSent((s) => ({ ...s, [key]: { state: r.alreadyAdded ? "exists" : "sent" } }));
      void loadDownloads();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível baixar.";
      setSent((s) => ({ ...s, [key]: { state: "error", message } }));
      if (/qBittorrent/i.test(message)) void loadQbt();
    }
  }

  async function removeDownload(d: DownloadView) {
    const cancel = d.phase !== "done";
    if (cancel && !confirm(`Cancelar o download e apagar o que já foi baixado?\n\n${d.name}`)) return;
    await fetch(`/api/nyaa/downloads?hash=${d.hash}${cancel ? "&files=1" : ""}`, { method: "DELETE" });
    void loadDownloads();
  }

  const groups = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of refineByLang(result?.items ?? [], resultLang)) if (i.info.group) count.set(i.info.group, (count.get(i.info.group) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [result, resultLang]);

  const shown = useMemo(
    () => refineByLang(result?.items ?? [], resultLang).filter((i) => (!kind || i.info.kind === kind) && (!group || i.info.group === group)),
    [result, resultLang, kind, group],
  );

  const canDownload = qbt?.connected === true && qbt.folders.length > 0;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="space-y-1">
        <h1 className="text-4xl font-black tracking-[-0.04em]">Buscar no Nyaa</h1>
        <p className="text-sm text-muted">Procure um anime, escolha a release e o download vai para a sua biblioteca pelo qBittorrent.</p>
      </div>

      <QbtPanel qbt={qbt} open={showConn} onToggle={() => setShowConn((v) => !v)} onChanged={(s) => { setQbt(s); setFolderId((c) => c ?? s.defaultFolderId); setShowConn(!s.connected); }} onRetry={loadQbt} />

      {qbt && qbt.folders.length === 0 && (
        <p className="rounded border border-border bg-surface p-3 text-sm" role="alert">
          Nenhuma pasta de biblioteca cadastrada.{" "}
          <Link href="/configuracoes" className="text-accent-fg underline">Cadastre uma em Configurações</Link> para poder baixar.
        </p>
      )}
      {qbt && qbt.folders.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <label htmlFor="destino">Baixar em:</label>
          {qbt.folders.length > 1 ? (
            <select id="destino" value={folderId ?? ""} onChange={(e) => setFolderId(Number(e.target.value))} className={`${input} max-w-full py-1`}>
              {qbt.folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
            </select>
          ) : (
            <code id="destino" className="rounded bg-surface px-2 py-0.5 text-foreground">{qbt.folders[0].path}</code>
          )}
        </p>
      )}

      {(downloads.length > 0 || downloadsError) && (
        <section aria-labelledby="dl-h" className="space-y-2 rounded border border-border bg-surface p-4">
          <h2 id="dl-h" className="text-lg font-black tracking-tight">Downloads</h2>
          {downloadsError && <p className="text-sm text-accent-fg" role="alert">{downloadsError}</p>}
          <ul className="divide-y divide-border">
            {downloads.map((d) => (
              <li key={d.hash} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="break-words text-sm font-medium">{d.name}</p>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-label={`Progresso de ${d.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(d.progress * 100)}
                  >
                    <div className={`h-full ${d.phase === "error" ? "bg-accent" : d.phase === "done" ? "bg-emerald-500" : "bg-foreground"}`} style={{ width: `${d.progress * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {d.label} · {Math.floor(d.progress * 100)}% de {fmtBytes(d.size)}
                    {d.phase === "downloading" && d.speed > 0 && ` · ${fmtBytes(d.speed)}/s`}
                    {d.eta != null && ` · falta ${fmtEta(d.eta)}`}
                    {d.phase === "done" && " · na biblioteca"}
                  </p>
                </div>
                <button type="button" className={ghost} onClick={() => removeDownload(d)}>
                  {d.phase === "done" ? "Remover da lista" : "Cancelar"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={submit} className="flex flex-wrap gap-2" role="search">
        <input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Nome do anime (ex.: Frieren)"
          aria-label="Buscar no Nyaa"
          className={`${input} min-w-0 flex-1 basis-60`}
        />
        <select aria-label="Idioma" value={filters.lang} onChange={(e) => change({ lang: e.target.value as NyaaLang })} className={input}>
          {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Resolução" value={filters.res} onChange={(e) => change({ res: e.target.value as NyaaResolution })} className={input}>
          {RESOLUTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Ordenar por" value={filters.sort} onChange={(e) => change({ sort: e.target.value as NyaaSort })} className={input}>
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className={btn} disabled={loading}>Buscar</button>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" checked={filters.trusted} onChange={(e) => change({ trusted: e.target.checked })} className="size-4 accent-[var(--accent)]" />
          Só uploaders confiáveis
        </label>
        <select aria-label="Tipo de release" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`${input} py-1`}>
          <option value="">Episódios e pacotes</option>
          <option value="episode">Só episódios avulsos</option>
          <option value="batch">Só pacotes (temporada/batch)</option>
        </select>
        <select aria-label="Fansub" value={group} onChange={(e) => setGroup(e.target.value)} className={`${input} py-1`} disabled={groups.length === 0}>
          <option value="">Qualquer fansub</option>
          {groups.map(([g, n]) => <option key={g} value={g}>{g} ({n})</option>)}
        </select>
      </div>

      <div aria-live="polite" className="text-sm text-muted">
        {loading ? "Buscando…" : result && `${result.total.toLocaleString("pt-BR")} resultado(s) no Nyaa${shown.length !== result.items.length ? ` · mostrando ${shown.length} de ${result.items.length} desta página` : ""}`}
      </div>

      {error && <p className="rounded border border-border bg-surface p-3 text-sm text-accent-fg" role="alert">{error}</p>}

      {result && !error && (
        shown.length === 0 && !loading ? (
          <p className="rounded border border-dashed border-border p-10 text-center text-sm text-muted">Nada encontrado com esses filtros.</p>
        ) : (
          <ul className={`divide-y divide-border rounded border border-border ${loading ? "opacity-60" : ""}`}>
            {shown.map((i) => <Row key={i.id} item={i} cover={covers[i.show]} coverPending={!(i.show in covers)} sent={sent[i.infoHash]} canDownload={canDownload} onDownload={() => download(i)} />)}
          </ul>
        )
      )}

      {result && result.pages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Páginas de resultados">
          <button className={ghost} disabled={loading || result.page <= 1} onClick={() => { void search(filters, result.page - 1); scrollTo({ top: 0 }); }}>Anterior</button>
          <span className="text-sm text-muted">Página {result.page} de {result.pages}</span>
          <button className={ghost} disabled={loading || result.page >= result.pages} onClick={() => { void search(filters, result.page + 1); scrollTo({ top: 0 }); }}>Próxima</button>
        </nav>
      )}
    </div>
  );
}

function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "good" | "warn" | "accent" }) {
  const cls = { plain: "border-border text-muted", good: "border-emerald-700 text-emerald-400", warn: "border-amber-700 text-amber-400", accent: "border-foreground/60 text-foreground" }[tone];
  return <span className={`rounded-sm border px-1.5 py-px text-[11px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}

/** Miniatura da capa; sem capa mostra a inicial do nome, e enquanto a busca não volta, um bloco pulsando. */
function Thumb({ cover, pending, name }: { cover?: Cover | null; pending: boolean; name: string }) {
  return (
    <div className="aspect-[2/3] w-12 shrink-0 self-start overflow-hidden rounded-[3px] bg-surface ring-1 ring-border sm:w-14" title={cover ? cover.name : undefined}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- capa vinda do AniList
        <img src={cover.url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
      ) : pending ? (
        <div className="size-full animate-pulse bg-border/60" aria-hidden />
      ) : (
        <div className="flex size-full items-center justify-center text-lg font-black text-muted" aria-hidden>{name.charAt(0).toUpperCase()}</div>
      )}
    </div>
  );
}

function Row({ item, cover, coverPending, sent, canDownload, onDownload }: { item: NyaaItem; cover?: Cover | null; coverPending: boolean; sent?: Sent; canDownload: boolean; onDownload: () => void }) {
  const { info } = item;
  const busy = sent?.state === "sending";
  const done = sent?.state === "sent" || sent?.state === "exists";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:p-4">
      <Thumb cover={cover} pending={coverPending} name={item.show} />
      <div className="min-w-0 flex-1 basis-56 space-y-1.5 sm:basis-72">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-words text-sm font-medium hover:underline">{item.title}</a>
        <div className="flex flex-wrap gap-1.5">
          {info.resolution && <Badge tone="accent">{info.resolution}</Badge>}
          {info.codec && <Badge>{info.codec}</Badge>}
          {info.source && <Badge>{info.source}</Badge>}
          {info.kind === "batch" && <Badge tone="warn">Pacote</Badge>}
          {info.kind === "episode" && info.episode != null && <Badge>Ep. {info.episode}</Badge>}
          {info.ptBrSub && <Badge tone="good">Legenda PT-BR</Badge>}
          {info.ptBrDub && <Badge tone="good">Dublado PT-BR</Badge>}
          {info.dualAudio && <Badge>Dual áudio</Badge>}
          {info.multiSub && <Badge>Multi-sub</Badge>}
          {item.trusted && <Badge tone="good">Confiável</Badge>}
          {item.remake && <Badge tone="warn">Remake</Badge>}
        </div>
        <p className="flex flex-wrap gap-x-3 text-xs text-muted">
          {info.group && <span>{info.group}</span>}
          <span>{item.size}</span>
          <span>{fmtDate(item.date)}</span>
          <span className={item.seeders > 0 ? "text-emerald-400" : "text-accent-fg"} title="Seeders: quem já tem o arquivo completo">↑ {item.seeders}</span>
          <span title="Leechers: quem está baixando">↓ {item.leechers}</span>
          <span>{item.downloads.toLocaleString("pt-BR")} downloads</span>
        </p>
        {sent?.state === "error" && <p className="text-xs text-accent-fg" role="alert">{sent.message}</p>}
      </div>
      <button
        type="button"
        className={`${btn} min-w-28`}
        disabled={!canDownload || busy || done}
        onClick={onDownload}
        title={canDownload ? undefined : "Conecte o qBittorrent para baixar"}
      >
        {busy ? "Enviando…" : sent?.state === "sent" ? "Na lista ✓" : sent?.state === "exists" ? "Já na lista" : "Baixar"}
      </button>
    </li>
  );
}

function QbtPanel({ qbt, open, onToggle, onChanged, onRetry }: {
  qbt: QbtStatus | null;
  open: boolean;
  onToggle: () => void;
  onChanged: (s: QbtStatus) => void;
  onRetry: () => Promise<QbtStatus>;
}) {
  const [url, setUrl] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (qbt && !loaded.current) {
      loaded.current = true;
      setUrl(qbt.config.url);
      setUser(qbt.config.username);
    }
  }, [qbt]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/nyaa/qbittorrent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, username: user, ...(pass ? { password: pass } : {}) }),
      });
      if (!res.ok) throw new Error(await readError(res, "Não consegui salvar."));
      const s = (await res.json()) as QbtStatus;
      setPass("");
      setMsg(s.connected ? `Conectado (qBittorrent ${s.version}).` : s.error);
      onChanged(s);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setBusy(false);
    }
  }

  if (!qbt) return <p className="text-sm text-muted">Verificando o qBittorrent…</p>;
  return (
    <section aria-label="Conexão com o qBittorrent" className="space-y-3">
      <p className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`inline-flex items-center gap-2 ${qbt.connected ? "text-emerald-400" : "text-amber-400"}`}>
          <span aria-hidden className={`size-2 rounded-full ${qbt.connected ? "bg-emerald-400" : "bg-amber-400"}`} />
          {qbt.connected ? `qBittorrent conectado (${qbt.version})` : "qBittorrent não conectado"}
        </span>
        <button type="button" className="text-muted underline hover:text-white" onClick={onToggle} aria-expanded={open}>
          {open ? "Esconder configuração" : "Configurar conexão"}
        </button>
      </p>
      {open && (
        <form onSubmit={save} className="space-y-3 rounded border border-border bg-surface p-4">
          {!qbt.connected && (
            <div className="space-y-2 text-sm text-muted">
              {qbt.error && <p className="text-accent-fg" role="alert">{qbt.error}</p>}
              <p>
                O app envia os downloads ao qBittorrent pela Interface Web dele. No qBittorrent: <b className="text-foreground">Ferramentas → Opções → Interface Web</b>,
                marque <b className="text-foreground">Interface de usuário Web (controle remoto)</b>, anote a porta e <b className="text-foreground">defina um usuário e uma senha</b>:
                as versões novas não ligam a interface sem eles. Depois informe tudo abaixo.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-48 flex-1 basis-56 flex-col gap-1 text-xs text-muted">
              Endereço
              <input value={url} onChange={(e) => setUrl(e.target.value)} className={`${input} text-foreground`} placeholder="http://127.0.0.1:8080" required />
            </label>
            <label className="flex min-w-32 flex-1 basis-36 flex-col gap-1 text-xs text-muted">
              Usuário
              <input value={user} onChange={(e) => setUser(e.target.value)} className={`${input} text-foreground`} autoComplete="off" />
            </label>
            <label className="flex min-w-32 flex-1 basis-36 flex-col gap-1 text-xs text-muted">
              Senha {qbt.config.hasPassword && "(deixe vazio para manter)"}
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className={`${input} text-foreground`} autoComplete="new-password" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className={btn} disabled={busy}>{busy ? "Testando…" : "Salvar e testar"}</button>
            <button type="button" className={ghost} disabled={busy} onClick={() => void onRetry()}>Testar de novo</button>
            {msg && <span className="text-sm text-muted" role="status">{msg}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
