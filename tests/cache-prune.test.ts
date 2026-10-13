import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("pruneVideoCache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "prune-"));
    await fs.mkdir(path.join(dir, "play"));
    vi.resetModules();
    process.env.CACHE_DIR = dir;
    process.env.STREAM_CACHE_GB = "0.000001"; // ~1 KB: tudo passa do limite
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.CACHE_DIR;
    delete process.env.STREAM_CACHE_GB;
  });

  const make = async (name: string, ageH: number) => {
    const p = path.join(dir, "play", name);
    await fs.writeFile(p, Buffer.alloc(4096));
    const t = new Date(Date.now() - ageH * 3600_000);
    await fs.utimes(p, t, t);
    return p;
  };

  it("não apaga o que foi usado há pouco nem o arquivo novo; apaga o antigo", async () => {
    const old = await make("old.mp4", 48);
    const used = await make("used.mp4", 0.1);
    const keep = await make("new.mp4", 72); // o novo é protegido pelo parâmetro, mesmo antigo
    const { pruneVideoCache } = await import("@/lib/media/cache");
    await pruneVideoCache(keep);
    const has = (p: string) => fs.access(p).then(() => true, () => false);
    expect(await has(old)).toBe(false);
    expect(await has(used)).toBe(true);
    expect(await has(keep)).toBe(true);
  });

  it("touch marca o arquivo como recente", async () => {
    const f = await make("a.mp4", 48);
    const { touch } = await import("@/lib/media/cache");
    await touch(f);
    expect(Date.now() - (await fs.stat(f)).mtimeMs).toBeLessThan(5000);
  });
});
