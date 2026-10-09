import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "streaming-fonts-"));
process.env.DATABASE_PATH = path.join(tmp, "test.db");
process.env.CACHE_DIR = path.join(tmp, "cache");
const FONT = "/usr/share/fonts/noto/NotoSansDuployan-Bold.ttf";
const mkv = path.join(tmp, "ep.mkv");

beforeAll(() => {
  const copies = ["A.ttf", "B.ttf", "C.ttf"].map((n) => {
    const f = path.join(tmp, n);
    fs.copyFileSync(FONT, f);
    return f;
  });
  const attach = copies.flatMap((f, i) => ["-attach", f, `-metadata:s:t:${i}`, "mimetype=application/x-truetype-font", `-metadata:s:t:${i}`, `filename=${path.basename(f)}`]);
  execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=5:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", ...attach, mkv]);
});

describe("fontes anexadas ao MKV", () => {
  it("pedir uma fonte extrai todas de uma vez (um único ffmpeg), sem uma execução por fonte", async () => {
    const { fontFile } = await import("@/lib/media/subtitles");
    const a = await fontFile(1, mkv, "A.ttf");
    expect(a && fs.statSync(a).size).toBe(fs.statSync(FONT).size);
    const dir = path.dirname(a!);
    // B e C já estão no disco sem terem sido pedidas
    expect(fs.readdirSync(dir)).toHaveLength(3);
  });

  it("pedidos simultâneos dividem a mesma extração e nomes inexistentes continuam recusados", async () => {
    const { fontFile } = await import("@/lib/media/subtitles");
    const [b, c] = await Promise.all([fontFile(2, mkv, "B.ttf"), fontFile(2, mkv, "C.ttf")]);
    expect(b).not.toBeNull();
    expect(c).not.toBeNull();
    expect(await fontFile(2, mkv, "../../etc/passwd")).toBeNull();
    expect(await fontFile(2, mkv, "Z.ttf")).toBeNull();
  });
});
