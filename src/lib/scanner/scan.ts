import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, episodes, libraryFolders, titles } from "@/lib/db";
import { enrichPending } from "@/lib/metadata";
import { enqueueMissingPreviews } from "@/lib/media/preview";
import { evaluateTitle, groupFiles, type FoundFile } from "./group";
import { VIDEO_EXTENSIONS } from "./parser";
import { getScanState, resetScanState, updateScanState } from "./state";

const SKIP_DIRS = /^(\..*|extras?|featurettes?|trailers?|samples?|behind the scenes|@eaDir)$/i;
const SAMPLE_FILE = /(^|[\W_])sample([\W_]|$)/i;

async function walk(root: string, onFound: (n: number) => void): Promise<FoundFile[]> {
  const out: FoundFile[] = [];
  async function rec(dir: string, rel: string[]) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // pasta sem permissão: ignora e segue
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.test(e.name)) await rec(path.join(dir, e.name), [...rel, e.name]);
      } else if (e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        if (SAMPLE_FILE.test(path.parse(e.name).name)) continue;
        out.push({ absPath: path.join(dir, e.name), segments: [...rel, e.name] });
        onFound(out.length);
      }
    }
  }
  await rec(root, []);
  return out;
}

export async function startScan(): Promise<boolean> {
  if (getScanState().running) return false;
  resetScanState();
  updateScanState({ running: true, phase: "walking" });
  void run().catch((err) =>
    updateScanState({ running: false, phase: "error", error: err instanceof Error ? err.message : String(err) }),
  );
  return true;
}

async function run() {
  const folders = db.select().from(libraryFolders).all();
  const walked: Array<{ folderId: number; files: FoundFile[] }> = [];
  const warnings: string[] = [];
  let found = 0;

  for (const f of folders) {
    // Pasta inacessível (HD desmontado etc.): não toca no catálogo dela.
    const st = await fs.stat(f.path).catch(() => null);
    if (!st?.isDirectory()) {
      warnings.push(`Pasta inacessível, ignorada: ${f.path}`);
      continue;
    }
    const base = found;
    const files = await walk(f.path, (n) => updateScanState({ filesFound: base + n, current: f.path }));
    found += files.length;
    walked.push({ folderId: f.id, files });
  }

  updateScanState({ phase: "saving", filesFound: found, total: found, processed: 0, current: null });

  let processed = 0;
  for (const { folderId, files } of walked) {
    persistFolder(folderId, files, (name) => {
      processed += 1;
      updateScanState({ processed, current: name });
    });
  }

  const meta = await runMetadata();
  warnings.push(...meta.warnings);

  const review = db.select({ id: titles.id }).from(titles).where(eq(titles.status, "needs_review")).all().length;
  updateScanState({ running: false, phase: "done", current: null, warnings, titlesNeedingReview: review });
  enqueueMissingPreviews(); // prévias em segundo plano, uma por vez; não atrasa o fim do scan
}

async function runMetadata() {
  updateScanState({ phase: "metadata", processed: 0, total: 0, current: null });
  return enrichPending((done, total, name) => updateScanState({ processed: done, total, current: name || null }));
}

/** Busca metadados dos títulos pendentes sem varrer o disco (ex.: após corrigir um nome). */
export function startMetadata(): boolean {
  if (getScanState().running) return false;
  resetScanState();
  updateScanState({ running: true });
  void runMetadata()
    .then((r) => updateScanState({ running: false, phase: "done", current: null, warnings: r.warnings }))
    .catch((err) => updateScanState({ running: false, phase: "error", error: err instanceof Error ? err.message : String(err) }));
  return true;
}

/** Sincroniza uma pasta-mãe com o banco numa transação. Exportada para testes. */
export function persistFolder(folderId: number, files: FoundFile[], onFile?: (name: string) => void) {
  const kind = db.select({ kind: libraryFolders.kind }).from(libraryFolders).where(eq(libraryFolders.id, folderId)).get()?.kind ?? "auto";
  const groups = groupFiles(files);
  // Pasta marcada como Filmes/Séries/Animes: a escolha do usuário vale mais que a detecção.
  if (kind !== "auto") for (const g of groups) g.category = kind;

  db.transaction((tx) => {
    const keepTitleIds: number[] = [];

    for (const g of groups) {
      const existing = tx
        .select()
        .from(titles)
        .where(and(eq(titles.folderId, folderId), eq(titles.sourceKey, g.sourceKey)))
        .get();

      let titleId: number;
      let manual = false;
      let name = g.name;
      let category = g.category;
      if (existing) {
        titleId = existing.id;
        manual = existing.manual;
        if (manual) {
          name = existing.name;
          category = existing.category;
        } else {
          // "anime" vem dos metadados; o scanner só distingue filme/série, então não rebaixa.
          if (kind === "auto" && existing.category === "anime" && category === "series") category = "anime";
          // Nome ou tipo (filme/série) mudou: o metadado cacheado deixou de valer.
          const renamed = existing.name !== name || existing.category !== category;
          tx.update(titles)
            .set({ name, year: g.year ?? existing.year, category, ...(renamed ? { metadataStatus: "pending" as const } : {}) })
            .where(eq(titles.id, titleId))
            .run();
        }
      } else {
        titleId = tx
          .insert(titles)
          .values({ folderId, sourceKey: g.sourceKey, name, year: g.year, category, createdAt: Date.now() })
          .returning({ id: titles.id })
          .get().id;
      }
      keepTitleIds.push(titleId);

      const existingEps = new Map(
        tx.select().from(episodes).where(eq(episodes.titleId, titleId)).all().map((e) => [e.filePath, e]),
      );
      const finalEps: Array<{ season: number | null; episode: number | null }> = [];

      for (const e of g.episodes) {
        const prev = existingEps.get(e.filePath);
        if (prev?.manual) {
          finalEps.push({ season: prev.season, episode: prev.episode });
        } else if (prev) {
          tx.update(episodes).set({ season: e.season, episode: e.episode }).where(eq(episodes.id, prev.id)).run();
          finalEps.push(e);
        } else {
          tx.insert(episodes).values({ titleId, filePath: e.filePath, season: e.season, episode: e.episode }).run();
          finalEps.push(e);
        }
        onFile?.(g.name);
      }

      // Remove episódios cujos arquivos não existem mais.
      const paths = g.episodes.map((e) => e.filePath);
      tx.delete(episodes).where(and(eq(episodes.titleId, titleId), notInArray(episodes.filePath, paths))).run();

      const ev = evaluateTitle({ name, manual, category, episodes: finalEps });
      tx.update(titles).set({ status: ev.status, reviewReason: ev.reason }).where(eq(titles.id, titleId)).run();
    }

    // Títulos desta pasta que sumiram do disco.
    const stale = tx.select({ id: titles.id }).from(titles).where(eq(titles.folderId, folderId)).all()
      .map((t) => t.id)
      .filter((id) => !keepTitleIds.includes(id));
    if (stale.length) tx.delete(titles).where(inArray(titles.id, stale)).run();
  });
}

/** Recalcula status de um título após correção manual. */
export function refreshTitleStatus(titleId: number) {
  const t = db.select().from(titles).where(eq(titles.id, titleId)).get();
  if (!t) return;
  const eps = db.select().from(episodes).where(eq(episodes.titleId, titleId)).all();
  const ev = evaluateTitle({ name: t.name, manual: t.manual, category: t.category, episodes: eps });
  db.update(titles).set({ status: ev.status, reviewReason: ev.reason }).where(eq(titles.id, titleId)).run();
}
