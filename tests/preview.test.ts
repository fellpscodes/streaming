import { describe, expect, it } from "vitest";
import { pickPreviewStart } from "@/lib/media/preview";

const ch = (title: string, start: number, end: number) => ({ title, start, end });
// capítulos reais do Koimonogatari 01 (26:34)
const REAL = [
  ch("Chapter 1", 0, 79), ch("OP", 79, 169), ch("Title", 169, 172), ch("Chapter 2", 172, 245.5), ch("Chapter 3", 245.5, 327),
  ch("Chapter 4", 327, 372.7), ch("Chapter 5", 372.7, 461), ch("Chapter 6", 461, 509.1), ch("Chapter 7", 509.1, 631),
  ch("Chapter 8", 631, 801.8), ch("Chapter 9", 801.8, 1450), ch("ED", 1450, 1540), ch("Next", 1540, 1594.6),
];

describe("trecho da prévia", () => {
  it("fica perto de 30% do episódio e dentro de um capítulo da história", () => {
    const s = pickPreviewStart(1594.6, REAL);
    expect(s).toBeGreaterThan(461);
    expect(s + 18).toBeLessThan(509.1); // o trecho inteiro cabe no capítulo 6
  });

  it("nunca cai na abertura, no encerramento nem na prévia do próximo", () => {
    // todos os capítulos "da história" são curtos demais, só sobram abertura/encerramento/prévia
    const only = [ch("Chapter 1", 0, 20), ch("OP", 20, 110), ch("Chapter 2", 110, 130), ch("ED", 130, 220), ch("Next", 220, 250)];
    const s = pickPreviewStart(250, only);
    const inKey = (a: number, b: number) => s < b && s + 18 > a;
    expect(inKey(20, 110)).toBe(false);
    expect(inKey(130, 250)).toBe(false);
  });

  it("sem capítulos: ~30%, longe do começo e do fim", () => {
    const s = pickPreviewStart(1440, []);
    expect(s).toBeCloseTo(432, 0);
    expect(s).toBeGreaterThanOrEqual(30);
    expect(s + 18).toBeLessThanOrEqual(1440 - 60);
  });

  it("vídeo curto: pega o meio", () => {
    expect(pickPreviewStart(60, [])).toBeCloseTo(21, 0);
    expect(pickPreviewStart(10, [])).toBe(0);
  });

  it("filme sem capítulos de abertura: usa os capítulos e evita os créditos", () => {
    const movie = [ch("Cena 1", 0, 1800), ch("Cena 2", 1800, 5400), ch("Créditos", 5400, 6000)];
    const s = pickPreviewStart(6000, movie);
    expect(s).toBeCloseTo(1800, -1); // 30% de 6000 = 1800
    expect(s + 18).toBeLessThan(5400);
  });
});
