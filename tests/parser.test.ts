import { describe, expect, it } from "vitest";
import { parseVideoPath } from "@/lib/scanner/parser";

const p = (...s: string[]) => parseVideoPath(s);

describe("parseVideoPath", () => {
  it("SxxExx com tags de release", () => {
    expect(p("Breaking Bad", "Season 1", "Breaking.Bad.S01E01.720p.BluRay.x264.mkv")).toEqual({
      title: "Breaking Bad", year: null, season: 1, episode: 1,
    });
  });
  it("temporada pela pasta quando o arquivo só tem episódio", () => {
    const r = p("Naruto", "Temporada 2", "Naruto Episódio 07.mkv");
    expect(r).toMatchObject({ title: "Naruto", season: 2, episode: 7 });
  });
  it("estilo fansub de anime", () => {
    expect(p("Attack on Titan", "[SubsPlease] Attack on Titan - 05 (1080p) [ABCD1234].mkv")).toMatchObject({
      title: "Attack on Titan", season: 1, episode: 5,
    });
  });
  it("formato 1x05", () => {
    expect(p("Friends", "Friends 1x05.mkv")).toMatchObject({ title: "Friends", season: 1, episode: 5 });
  });
  it("filme em pasta com ano", () => {
    expect(p("Inception (2010)", "Inception.2010.1080p.BluRay.x264.mkv")).toEqual({
      title: "Inception", year: 2010, season: null, episode: null,
    });
  });
  it("filme solto na raiz", () => {
    expect(p("The.Matrix.1999.720p.mkv")).toMatchObject({ title: "The Matrix", year: 1999, episode: null });
  });
  it("episódio solto na raiz", () => {
    expect(p("Dark.S01E02.mkv")).toMatchObject({ title: "Dark", season: 1, episode: 2 });
  });
  it("arquivo sem padrão algum", () => {
    expect(p("Random Show", "video1.mkv")).toMatchObject({ title: "Random Show", season: null, episode: null });
  });
  it("não confunde ano/resolução com episódio", () => {
    expect(p("Blade Runner 2049 (2017)", "Blade.Runner.2049.2017.1080p.mkv")).toMatchObject({
      title: "Blade Runner 2049", year: 2017, episode: null,
    });
  });
});

describe("nomes que começam com palavra de release", () => {
  it("não apaga o título", () => {
    expect(p("Hevc Show", "Hevc Show - 01.mkv")).toMatchObject({ title: "Hevc Show", episode: 1 });
    expect(p("Complete Savages", "Complete Savages S01E02.mkv")).toMatchObject({ title: "Complete Savages", episode: 2 });
  });
});

describe("acentos", () => {
  it("preserva acentos no título", () => {
    expect(p("Pokémon", "Pokémon Episódio 12.mkv")).toMatchObject({ title: "Pokémon", season: 1, episode: 12 });
  });
});
