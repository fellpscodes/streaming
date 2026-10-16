import { getSetting, setSetting } from "@/lib/settings";

/** Categoria dos torrents que o app adiciona: é por ela que a lista de downloads só mostra o que veio daqui. */
export const QBT_CATEGORY = "streaming";

export interface QbtConfig {
  url: string;
  username: string;
  password: string;
}

export class QbtError extends Error {}

const SETTING_KEY = "qbittorrent";

export function getQbtConfig(): QbtConfig {
  const base: QbtConfig = {
    url: process.env.QBT_URL ?? "http://127.0.0.1:8080",
    username: process.env.QBT_USER ?? "",
    password: process.env.QBT_PASS ?? "",
  };
  const saved = getSetting(SETTING_KEY);
  if (!saved) return base;
  try {
    return { ...base, ...(JSON.parse(saved) as Partial<QbtConfig>) };
  } catch {
    return base;
  }
}

export function saveQbtConfig(cfg: QbtConfig) {
  setSetting(SETTING_KEY, JSON.stringify(cfg));
}

/** Aceita "localhost:8080" sem esquema e remove a barra final. Lança QbtError se não for http(s). */
export function normalizeQbtUrl(raw: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `http://${raw.trim()}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    throw new QbtError("Endereço inválido. Exemplo: http://127.0.0.1:8080");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new QbtError("Use um endereço http:// ou https://");
  return u.origin + u.pathname.replace(/\/+$/, "");
}

// Cookie de sessão por endereço+usuário, em memória.
const g = globalThis as unknown as { __qbtSid?: Map<string, string> };
const sessions = (g.__qbtSid ??= new Map());
const sessionKey = (c: QbtConfig) => `${c.url}|${c.username}`;

async function raw(cfg: QbtConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const sid = sessions.get(sessionKey(cfg));
  try {
    return await fetch(`${cfg.url}/api/v2${path}`, {
      ...init,
      headers: { Referer: cfg.url, ...(sid ? { Cookie: sid } : {}), ...init.headers },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new QbtError(`Não consegui falar com o qBittorrent em ${cfg.url}. Ele está aberto, com a Interface Web ativada?`, { cause: e });
  }
}

async function login(cfg: QbtConfig) {
  const res = await raw(cfg, "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: cfg.username, password: cfg.password }),
  });
  if (res.status === 403) throw new QbtError("O qBittorrent bloqueou o login (muitas tentativas erradas). Aguarde alguns minutos.");
  // v5: 204 sem corpo (senha errada = 401). Versões antigas: 200 com "Ok." / "Fails."
  if (!res.ok || (await res.text()).trim() === "Fails.") throw new QbtError("Usuário ou senha do qBittorrent incorretos.");
  // o cookie é "SID" nas versões antigas e "QBT_SID_<porta>" na v5
  const cookie = res.headers.getSetCookie().find((c) => /^[^=;]*SID[^=;]*=/.test(c));
  if (cookie) sessions.set(sessionKey(cfg), cookie.split(";")[0]);
}

/** Chamada à API do qBittorrent; se a sessão não vale (403), entra e tenta uma vez de novo. */
async function call(cfg: QbtConfig, path: string, init?: RequestInit): Promise<Response> {
  let res = await raw(cfg, path, init);
  if (res.status === 403 || res.status === 401) {
    await login(cfg);
    res = await raw(cfg, path, init);
  }
  if (res.status === 403 || res.status === 401) throw new QbtError("O qBittorrent recusou o acesso. Confira usuário e senha.");
  return res;
}

const form = (data: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(data),
});

/** Versão do qBittorrent: serve de teste de conexão. */
export async function qbtVersion(cfg: QbtConfig): Promise<string> {
  const res = await call(cfg, "/app/version");
  if (!res.ok) throw new QbtError(`O qBittorrent respondeu ${res.status}.`);
  return (await res.text()).trim();
}

export interface QbtTorrent {
  hash: string;
  name: string;
  /** 0–1 */
  progress: number;
  /** bytes/s */
  dlspeed: number;
  /** segundos; 8640000 = infinito */
  eta: number;
  size: number;
  state: string;
  save_path: string;
  added_on: number;
}

export async function qbtList(cfg: QbtConfig): Promise<QbtTorrent[]> {
  const res = await call(cfg, `/torrents/info?${new URLSearchParams({ category: QBT_CATEGORY })}`);
  if (!res.ok) throw new QbtError(`O qBittorrent respondeu ${res.status}.`);
  return (await res.json()) as QbtTorrent[];
}

export async function qbtAddMagnet(cfg: QbtConfig, magnet: string, savePath: string) {
  // sem a categoria criada, versões antigas ignoram o parâmetro; 409 = já existe
  await call(cfg, "/torrents/createCategory", form({ category: QBT_CATEGORY, savePath: "" })).catch(() => {});
  const res = await call(
    cfg,
    "/torrents/add",
    // autoTMM=false: com o gerenciamento automático ligado o qBittorrent ignoraria a pasta escolhida
    form({ urls: magnet, savepath: savePath, category: QBT_CATEGORY, autoTMM: "false" }),
  );
  const text = (await res.text()).trim();
  if (!res.ok || text === "Fails.") throw new QbtError("O qBittorrent não aceitou o torrent (link inválido ou pasta sem permissão).");
}

export async function qbtDelete(cfg: QbtConfig, hash: string, deleteFiles: boolean) {
  const res = await call(cfg, "/torrents/delete", form({ hashes: hash, deleteFiles: String(deleteFiles) }));
  if (!res.ok) throw new QbtError(`O qBittorrent respondeu ${res.status}.`);
}

export interface DownloadView {
  hash: string;
  name: string;
  progress: number;
  speed: number;
  /** segundos restantes; null = desconhecido */
  eta: number | null;
  size: number;
  phase: "downloading" | "queued" | "paused" | "checking" | "done" | "error";
  label: string;
  savePath: string;
}

const STATES: Record<string, [DownloadView["phase"], string]> = {
  downloading: ["downloading", "Baixando"],
  forcedDL: ["downloading", "Baixando"],
  stalledDL: ["downloading", "Aguardando fontes"],
  metaDL: ["downloading", "Obtendo informações"],
  forcedMetaDL: ["downloading", "Obtendo informações"],
  allocating: ["downloading", "Preparando"],
  queuedDL: ["queued", "Na fila"],
  queuedUP: ["done", "Concluído"],
  pausedDL: ["paused", "Pausado"],
  stoppedDL: ["paused", "Pausado"],
  checkingDL: ["checking", "Verificando"],
  checkingUP: ["checking", "Verificando"],
  checkingResumeData: ["checking", "Verificando"],
  moving: ["checking", "Movendo arquivos"],
  uploading: ["done", "Concluído"],
  forcedUP: ["done", "Concluído"],
  stalledUP: ["done", "Concluído"],
  pausedUP: ["done", "Concluído"],
  stoppedUP: ["done", "Concluído"],
  error: ["error", "Erro"],
  missingFiles: ["error", "Arquivos ausentes"],
};

export function toDownloadView(t: QbtTorrent): DownloadView {
  const [phase, label] = t.progress >= 1 ? ["done" as const, "Concluído"] : (STATES[t.state] ?? ["downloading" as const, t.state]);
  return {
    hash: t.hash,
    name: t.name,
    progress: t.progress,
    speed: t.dlspeed,
    eta: t.eta > 0 && t.eta < 8640000 && phase === "downloading" ? t.eta : null,
    size: t.size,
    phase,
    label,
    savePath: t.save_path,
  };
}
