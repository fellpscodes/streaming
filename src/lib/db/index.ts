import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { backupIfDue } from "./backup";
import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaming.db");

/**
 * O `next build` carrega as rotas em vários processos ao mesmo tempo; num banco novo todos tentam
 * criar as tabelas juntos. Quem perde a corrida tenta de novo e encontra a migração já aplicada.
 */
function runMigrations(db: ReturnType<typeof drizzle<typeof schema>>) {
  for (let attempt = 1; ; attempt++) {
    try {
      migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
      return;
    } catch (e) {
      if (attempt >= 8 || !/already exists|duplicate column|locked|busy/i.test(String((e as { cause?: unknown }).cause ?? e))) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * attempt);
    }
  }
}

function createDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000"); // espera outro processo soltar o banco em vez de falhar
  const db = drizzle(sqlite, { schema });
  runMigrations(db);
  // Backup fora da pasta do projeto (ver backup.ts). Não roda no build nem nos testes.
  if (process.env.NEXT_PHASE !== "phase-production-build" && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
    backupIfDue(sqlite).catch((e) => console.warn("[backup] falhou:", e instanceof Error ? e.message : e));
  }
  return db;
}

// Singleton: evita abrir várias conexões com o hot reload do dev server.
const g = globalThis as unknown as { __db?: ReturnType<typeof createDb> };
export const db = (g.__db ??= createDb());
export * from "./schema";
