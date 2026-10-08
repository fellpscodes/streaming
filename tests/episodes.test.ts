import { describe, expect, it } from "vitest";
import { compareEpisodes, episodeLabel, fileTitle } from "@/lib/episodes";
import { evaluateTitle } from "@/lib/scanner/group";

const ep = (id: number, filePath: string, season: number | null = null, episode: number | null = null) => ({ id, filePath, season, episode });

describe("título do episódio", () => {
  it("é o nome do arquivo sem a extensão, como está", () => {
    expect(fileTitle("/midia/Show/[Fansub] Show - O Início (1080p).mkv")).toBe("[Fansub] Show - O Início (1080p)");
    expect(fileTitle("C:\\Midia\\Show\\video 1.final.mp4")).toBe("video 1.final");
  });

  it("rótulo: T1 E3 quando reconhecido; senão o nome do arquivo", () => {
    expect(episodeLabel(ep(1, "/x/a.mkv", 1, 3))).toBe("T1 E3");
    expect(episodeLabel(ep(1, "/x/Parte Final.mkv"))).toBe("Parte Final");
  });
});

describe("ordem dos episódios", () => {
  it("numerados primeiro; os sem número em ordem natural do nome (2 antes de 10)", () => {
    const list = [
      ep(1, "/x/ep 10.mkv"),
      ep(2, "/x/ep 2.mkv"),
      ep(3, "/x/Show S01E02.mkv", 1, 2),
      ep(4, "/x/Show S01E01.mkv", 1, 1),
      ep(5, "/x/ep 1.mkv"),
    ].sort(compareEpisodes);
    expect(list.map((e) => e.id)).toEqual([4, 3, 5, 2, 1]);
  });
});

describe("revisão manual", () => {
  const eps = [{ season: null, episode: null }, { season: null, episode: null }, { season: 1, episode: 1 }, { season: 1, episode: 1 }];
  it("episódio sem número ou repetido não pede correção", () => {
    expect(evaluateTitle({ name: "Show", manual: false, category: "series", episodes: eps }).status).toBe("ok");
    expect(evaluateTitle({ name: "Show", manual: false, category: "anime", episodes: eps }).status).toBe("ok");
  });
  it("nome ilegível continua pedindo", () => {
    expect(evaluateTitle({ name: "!!!", manual: false, category: "series", episodes: eps }).status).toBe("needs_review");
  });
  it("vários vídeos num título forçado como filme continuam pedindo", () => {
    expect(evaluateTitle({ name: "Filme", manual: false, category: "movie", episodes: eps }).status).toBe("needs_review");
  });
});
