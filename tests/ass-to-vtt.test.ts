import { describe, expect, it } from "vitest";
import { assToVtt } from "@/lib/media/ass-to-vtt";

const ass = `[Script Info]
Title: x

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}Olá, mundo{\\i0}\\Nsegunda linha
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\an8}No topo
Dialogue: 0,0:00:05.00,0:00:05.04,Fx,,0,0,0,,{\\pos(10,10)}efeito quadro a quadro
Dialogue: 0,0:00:06.00,0:00:09.00,Fx,,0,0,0,,{\\move(0,0,10,10)}movimento
Dialogue: 0,0:00:10.00,0:00:12.00,Default,,0,0,0,,{\\p1}m 0 0 l 10 10
Dialogue: 1,0:00:01.00,0:00:03.50,Default,,0,0,0,,No topo
Dialogue: 0,0:01:02.25,0:01:04.00,Default,,0,0,0,,a < b & c
`;

const styled = `[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,40,&H00FFFFFF,&H000000FF,&H00112233,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1
Style: Placa,Arial,40,&H0000FFFF,&H000000FF,&H00000000,&H00000000,0,-1,0,0,100,100,0,0,1,2,0,8,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Fala
Dialogue: 0,0:00:04.00,0:00:06.00,Placa,,0,0,0,,Letreiro {\\i1}torto{\\i0}
`;

describe("assToVtt com estilos", () => {
  const vtt = assToVtt(styled);
  it("gera uma classe por estilo com cor, contorno e peso", () => {
    expect(vtt).toContain("STYLE\n::cue(.s0){color:#ffffff;");
    expect(vtt).toContain("#332211"); // contorno BBGGRR -> RRGGBB
    expect(vtt).toContain("::cue(.s1){color:#ffff00;");
    expect(vtt).toContain("font-weight:700");
    expect(vtt).toContain("font-style:italic");
  });
  it("aplica a classe e o topo pelo alinhamento do estilo", () => {
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.000\n<c.s0>Fala</c>");
    expect(vtt).toContain("line:8%\n<c.s1>Letreiro <i>torto</i></c>");
  });
});

describe("assToVtt", () => {
  const vtt = assToVtt(ass);
  it("mantém o texto e converte quebras e tempos", () => {
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.500\n<i>Olá, mundo</i>\nsegunda linha");
    expect(vtt).toContain("00:01:02.250 --> 00:01:04.000");
  });
  it("posiciona no topo e junta camadas repetidas", () => {
    expect(vtt).toContain("line:8%\nNo topo");
    expect(vtt.match(/No topo/g)).toHaveLength(1);
  });
  it("descarta efeitos, movimentos e desenhos", () => {
    expect(vtt).not.toContain("quadro a quadro");
    expect(vtt).not.toContain("movimento");
    expect(vtt).not.toContain("m 0 0");
  });
  it("escapa caracteres especiais", () => {
    expect(vtt).toContain("a &lt; b &amp; c");
  });
});
