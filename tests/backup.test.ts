import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { backupIfDue } from "@/lib/db/backup";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-backup-"));

function makeDb(withData: boolean) {
  const db = new Database(path.join(tmp, `src-${Math.random()}.db`));
  db.pragma("journal_mode = WAL"); // como o banco real
  db.exec("CREATE TABLE library_folders (id INTEGER PRIMARY KEY, path TEXT); CREATE TABLE titles (id INTEGER PRIMARY KEY, name TEXT);");
  if (withData) db.prepare("INSERT INTO library_folders (path) VALUES (?)").run("/midia");
  return db;
}
const at = (iso: string) => new Date(iso);

describe("backup automático do banco", () => {
  it("não faz backup de banco vazio", async () => {
    const dir = path.join(tmp, "vazio");
    expect(await backupIfDue(makeDb(false), { dir })).toBeNull();
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("copia o banco com os dados, consistente e legível", async () => {
    const dir = path.join(tmp, "a");
    const dest = await backupIfDue(makeDb(true), { dir, now: at("2026-10-08T10:00:00") });
    expect(dest).toMatch(/streaming-20261008-100000\.db$/);
    const copy = new Database(dest!, { readonly: true });
    expect(copy.prepare("SELECT path FROM library_folders").get()).toEqual({ path: "/midia" });
    copy.close();
    expect(fs.readdirSync(dir)).toEqual(["streaming-20261008-100000.db"]); // arquivo único, sem -wal/-shm
  });

  it("respeita o intervalo entre backups", async () => {
    const dir = path.join(tmp, "b");
    const db = makeDb(true);
    expect(await backupIfDue(db, { dir, everyMs: 3600_000 })).not.toBeNull();
    expect(await backupIfDue(db, { dir, everyMs: 3600_000 })).toBeNull(); // acabou de fazer
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });

  it("mantém só os N mais recentes", async () => {
    const dir = path.join(tmp, "c");
    const db = makeDb(true);
    for (let d = 1; d <= 5; d++) {
      await backupIfDue(db, { dir, everyMs: 0, keep: 3, now: at(`2030-10-0${d}T08:00:00`) });
    }
    expect(fs.readdirSync(dir).sort()).toEqual(["streaming-20301003-080000.db", "streaming-20301004-080000.db", "streaming-20301005-080000.db"]);
  });
});
