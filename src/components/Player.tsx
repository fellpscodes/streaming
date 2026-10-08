"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface SubTrack {
  id: string;
  label: string;
  format: "ass" | "vtt";
  isDefault: boolean;
  url: string;
}
interface AudioTrack {
  index: number;
  label: string;
  isDefault: boolean;
}

interface Props {
  episodeId: number;
  title: string;
  subtitle: string;
  backHref: string;
  prevHref: string | null;
  nextHref: string | null;
  startAt: number;
}

interface Segment {
  start: number;
  end: number;
  source: "chapters" | "manual";
}
interface SkipData {
  intro: Segment | null;
  outro: Segment | null;
  marks: { introStart?: number; introEnd?: number; outroStart?: number };
}

type JassubInstance = { destroy: () => Promise<void> | void; resize?: (forceRepaint?: boolean) => Promise<void> };

/** Sem capítulos nem marcas, o encerramento é considerado como os últimos 90 s (só em vídeos longos). */
const FALLBACK_OUTRO_SECONDS = 90;
const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function Player({ episodeId, title, subtitle, backHref, prevHref, nextHref, startAt }: Props) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastVideo = useRef<HTMLVideoElement | null>(null); // o React solta videoRef ao esconder a tela; este guarda o elemento
  const jassubRef = useRef<JassubInstance | null>(null);
  const resumeAt = useRef(startAt);

  const [phase, setPhase] = useState<"preparing" | "ready" | "error">("preparing");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "compat">("auto");
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [audioIndex, setAudioIndex] = useState<number | null>(null);
  const [subs, setSubs] = useState<{ tracks: SubTrack[]; fonts: string[] } | null>(null);
  const [subId, setSubId] = useState<string>("");
  const [uiVisible, setUiVisible] = useState(true);
  const [ended, setEnded] = useState(false);
  const [skip, setSkip] = useState<SkipData | null>(null);
  const [now, setNow] = useState(0); // posição atual (s), para decidir quando mostrar "Pular abertura"
  const [dur, setDur] = useState(0);
  const [markOpen, setMarkOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const completedRef = useRef(false); // ao pular para o próximo, não deixa um save tardio desmarcar "concluído"
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** Volta ao estado "preparando" ao trocar de áudio ou de modo. */
  function restart() {
    setPhase("preparing");
    setProgress(0);
    setStreamUrl(null);
  }
  function switchToCompat() {
    restart();
    setError(null);
    setMode("compat");
  }

  // 1) Prepara o vídeo (remux sem perda quando preciso) e espera ficar pronto.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      while (!cancelled) {
        const res = await post(`/api/play/${episodeId}`, { audio: audioIndex, mode }).catch(() => null);
        const data = res ? await res.json().catch(() => null) : null;
        if (cancelled) return;
        if (!res?.ok || !data) {
          setError(data?.error ?? "Falha ao preparar o vídeo.");
          return setPhase("error");
        }
        setAudioTracks(data.audioTracks);
        if (data.state === "ready") {
          setAudioIndex((cur) => cur ?? data.audioIndex);
          setStreamUrl(data.streamUrl);
          return setPhase("ready");
        }
        setProgress(data.progress ?? 0);
        await new Promise((r) => setTimeout(r, 1000));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [episodeId, audioIndex, mode]);

  // 2) Lista de legendas (uma vez por episódio). O servidor já diz qual faixa vem selecionada:
  //    a que você escolheu antes neste título (ou "sem legenda"), senão a padrão do arquivo.
  useEffect(() => {
    fetch(`/api/subtitles/${episodeId}`)
      .then((r) => r.json())
      .then((d: { tracks: SubTrack[]; fonts: string[]; selectedId: string }) => {
        setSubs(d);
        setSubId(d.selectedId);
      })
      .catch(() => setSubs({ tracks: [], fonts: [] }));
  }, [episodeId]);

  /** Troca a legenda e lembra a escolha para os próximos episódios deste título. */
  function chooseSubtitle(id: string) {
    setSubId(id);
    void fetch(`/api/subtitle-preference/${episodeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: id }),
    });
  }

  // 3) Renderiza a legenda: ASS/SSA com libass (JASSUB) para manter estilo, posição e efeitos; VTT com <track> nativo.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || phase !== "ready" || !subs) return;
    const track = subs.tracks.find((t) => t.id === subId);
    let cancelled = false;
    let trackEl: HTMLTrackElement | null = null;

    (async () => {
      await jassubRef.current?.destroy();
      jassubRef.current = null;
      if (!track || cancelled) return;
      if (track.format === "vtt") {
        trackEl = document.createElement("track");
        Object.assign(trackEl, { kind: "subtitles", label: track.label, src: track.url, default: true });
        video.appendChild(trackEl);
        trackEl.track.mode = "showing";
        return;
      }
      const { default: JASSUB } = await import("jassub");
      if (cancelled) return;
      jassubRef.current = new JASSUB({ video, subUrl: track.url, fonts: subs.fonts }) as unknown as JassubInstance;
    })();

    return () => {
      cancelled = true;
      trackEl?.remove();
    };
  }, [subId, subs, phase]);

  useEffect(() => () => void jassubRef.current?.destroy(), []);

  // Abertura e encerramento deste episódio (capítulos do arquivo ou marcas manuais do título).
  useEffect(() => {
    fetch(`/api/skip/${episodeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSkip)
      .catch(() => setSkip(null));
  }, [episodeId]);

  async function saveMarks(patch: Record<string, number | null>) {
    const res = await fetch(`/api/skip/${episodeId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (res.ok) setSkip(await res.json());
  }
  async function clearMarks() {
    const res = await fetch(`/api/skip/${episodeId}`, { method: "DELETE" });
    if (res.ok) setSkip(await res.json());
  }

  /** Vai para o próximo episódio marcando este como concluído (o "Continuar assistindo" passa a oferecer o seguinte). */
  function goNext() {
    const v = videoRef.current;
    if (v && v.duration && Number.isFinite(v.duration)) {
      completedRef.current = true;
      void fetch("/api/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId, position: v.duration, duration: v.duration }),
        keepalive: true,
      });
    }
  }
  function skipIntro() {
    if (videoRef.current && skip?.intro) videoRef.current.currentTime = skip.intro.end;
  }

  // O Next mantém as telas anteriores montadas (ocultas) para voltar rápido a elas. Sem isto, o vídeo da tela
  // que você deixou continua tocando por trás. Esconder a tela desmonta os efeitos, então pausa aqui.
  useEffect(
    () => () => {
      lastVideo.current?.pause();
    },
    [],
  );

  // 4) Progresso: a cada 10 s tocando, ao pausar, ao sair da aba.
  const save = useCallback(
    (beacon = false) => {
      const v = videoRef.current;
      if (completedRef.current || !v || !v.duration || !Number.isFinite(v.duration)) return;
      const body = JSON.stringify({ episodeId, position: v.currentTime, duration: v.duration });
      if (beacon) navigator.sendBeacon("/api/progress", new Blob([body], { type: "application/json" }));
      else void fetch("/api/progress", { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    },
    [episodeId],
  );
  useEffect(() => {
    const iv = setInterval(() => videoRef.current && !videoRef.current.paused && save(), 10000);
    const onHide = () => document.visibilityState === "hidden" && save(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => save(true));
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onHide);
      save(true);
    };
  }, [save]);

  function onLoadedMetadata() {
    const v = videoRef.current!;
    setDur(v.duration);
    // HEVC sem suporte costuma tocar só o áudio (largura 0): refaz em H.264 de alta qualidade.
    if (v.videoWidth === 0 && mode === "auto") {
      resumeAt.current = v.currentTime || resumeAt.current;
      return switchToCompat();
    }
    if (resumeAt.current > 5 && resumeAt.current < v.duration - 5) v.currentTime = resumeAt.current;
    resumeAt.current = 0;
    void v.play().catch(() => {});
  }

  function onVideoError() {
    const v = videoRef.current;
    if (mode === "auto") {
      resumeAt.current = v?.currentTime || resumeAt.current;
      return switchToCompat();
    }
    setError("O navegador não conseguiu reproduzir este vídeo.");
    setPhase("error");
  }

  function changeAudio(idx: number) {
    resumeAt.current = videoRef.current?.currentTime ?? 0;
    restart();
    setAudioIndex(idx);
  }

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
  }, []);

  // A legenda ASS é um canvas ao lado do <video>: só aparece em tela cheia se o CONTÊINER for o elemento em tela cheia.
  // Duplo clique e menu do Chrome colocam só o <video> em tela cheia (e a legenda some); aqui isso é redirecionado.
  useEffect(() => {
    function onChange() {
      const wrap = wrapRef.current;
      if (document.fullscreenElement && document.fullscreenElement === videoRef.current && wrap) {
        // Troca direto para o contêiner, sem sair antes (sair gasta o gesto do usuário e o pedido seguinte falharia).
        // Se o navegador recusar, fica a tela cheia nativa em vez de expulsar o usuário dela.
        wrap.requestFullscreen().catch(() => {});
        return;
      }
      // O tamanho mudou: o canvas das legendas precisa se ajustar ao novo quadro.
      for (const ms of [50, 300, 800]) setTimeout(() => void jassubRef.current?.resize?.(true), ms);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const v = videoRef.current;
      if (!v || (e.target as HTMLElement).closest("select,input,textarea")) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key === "ArrowRight") v.currentTime += 10;
      else if (e.key === "ArrowLeft") v.currentTime -= 10;
      else if (e.key === "f") toggleFullscreen();
      else if (e.key === "m") v.muted = !v.muted;
      else if (e.key === "n" && nextHref) {
        goNext();
        router.push(nextHref);
      }
      else if (e.key === "p" && prevHref) router.push(prevHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- goNext só usa refs e o episódio atual
  }, [toggleFullscreen, nextHref, prevHref, router]);

  function poke() {
    setUiVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => !videoRef.current?.paused && setUiVisible(false), 3000);
  }

  // Quando mostrar os botões de pulo.
  const introWindow = skip?.intro ? now >= skip.intro.start - 2 && now < skip.intro.end - 1 : false;
  const outroStart = skip?.outro?.start ?? (dur > 300 ? dur - FALLBACK_OUTRO_SECONDS : null);
  const showIntroButton = phase === "ready" && !ended && introWindow;
  const showNextButton = phase === "ready" && Boolean(nextHref) && (ended || (outroStart != null && now >= outroStart));

  const sel = "rounded bg-black/70 px-2 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-accent";

  return (
    <div
      ref={wrapRef}
      onMouseMove={poke}
      onTouchStart={poke}
      // Duplo clique no vídeo = tela cheia do CONTÊINER (com a legenda), não a nativa do <video>.
      onDoubleClickCapture={(e) => {
        if (e.target === videoRef.current) {
          e.stopPropagation();
          e.preventDefault();
          clearTimeout(clickTimer.current); // o primeiro clique do duplo clique não deve pausar
          toggleFullscreen();
        }
      }}
      onClick={(e) => {
        if (e.target !== videoRef.current) return;
        clearTimeout(clickTimer.current);
        clickTimer.current = setTimeout(togglePlay, 250);
      }}
      className={`relative flex aspect-video max-h-[calc(100vh-3.5rem)] w-full items-center justify-center bg-black [&:fullscreen]:aspect-auto [&:fullscreen]:max-h-none ${uiVisible ? "" : "cursor-none"}`}
    >
      <h1 className="sr-only">{title} — {subtitle}</h1>
      {streamUrl && (
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el) lastVideo.current = el;
          }}
          key={streamUrl}
          src={streamUrl}
          playsInline
          disablePictureInPicture
          preload="auto"
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDur(e.currentTarget.duration)}
          onError={onVideoError}
          onPause={() => (setPlaying(false), save(), setUiVisible(true))}
          onPlay={() => (setPlaying(true), setEnded(false), poke())}
          onVolumeChange={(e) => (setVolume(e.currentTarget.volume), setMuted(e.currentTarget.muted))}
          onEnded={() => (save(), setEnded(true))}
          className="size-full"
        />
      )}

      {phase === "preparing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center" role="status" aria-live="polite">
          <div className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-sm text-neutral-300">
            {mode === "compat" ? "Convertendo para H.264 em alta qualidade" : "Preparando o vídeo sem perda de qualidade"}
            {progress > 0 && ` · ${Math.round(progress * 100)}%`}
          </p>
        </div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
          <p className="text-red-400">{error}</p>
          <button onClick={switchToCompat} className="rounded bg-accent px-4 py-2 text-sm text-white">
            Tentar modo compatível (H.264)
          </button>
        </div>
      )}

      {/* Barra superior: voltar, título, faixas de áudio/legenda, tela cheia */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent p-3 transition-opacity ${uiVisible || phase !== "ready" ? "opacity-100" : "opacity-0"}`}
      >
        <div className="pointer-events-auto min-w-0">
          <Link href={backHref} className="text-sm text-neutral-300 hover:text-white">← Voltar</Link>
          <p className="truncate font-medium">{title}</p>
          <p className="truncate text-xs text-neutral-400">{subtitle}{mode === "compat" && " · modo compatível"}</p>
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          {audioTracks.length > 1 && (
            <select aria-label="Áudio" value={audioIndex ?? ""} onChange={(e) => changeAudio(Number(e.target.value))} className={sel}>
              {audioTracks.map((a) => <option key={a.index} value={a.index}>🔊 {a.label}</option>)}
            </select>
          )}
          {subs && subs.tracks.length > 0 && (
            <select aria-label="Legenda" value={subId} onChange={(e) => chooseSubtitle(e.target.value)} className={sel}>
              <option value="">💬 Sem legenda</option>
              {subs.tracks.map((t) => <option key={t.id} value={t.id}>💬 {t.label}</option>)}
            </select>
          )}
          {prevHref && (
            <Link href={prevHref} className={sel} aria-label="Episódio anterior" title="Episódio anterior (p)">⏮</Link>
          )}
          {nextHref && (
            <Link href={nextHref} onClick={goNext} className={sel} aria-label="Pular para o próximo episódio" title="Próximo episódio (n)">⏭</Link>
          )}
          <button onClick={() => setMarkOpen((o) => !o)} className={sel} aria-label="Marcar abertura e encerramento" aria-expanded={markOpen} title="Abertura e encerramento">⏱</button>
        </div>
      </div>

      {markOpen && skip && (
        <div role="dialog" aria-label="Abertura e encerramento" className="absolute right-3 top-14 z-20 w-72 max-w-[calc(100%-1.5rem)] space-y-3 rounded-lg border border-border bg-surface/95 p-3 text-sm shadow-xl">
          <div>
            <p className="font-medium">Abertura</p>
            {skip.intro ? (
              <p className="text-xs text-neutral-400">
                {fmt(skip.intro.start)}–{fmt(skip.intro.end)} · {skip.intro.source === "chapters" ? "detectada pelos capítulos do arquivo" : "marcada por você (vale para a série)"}
              </p>
            ) : (
              <p className="text-xs text-neutral-400">
                Não detectada.{skip.marks.introStart != null ? ` Início em ${fmt(skip.marks.introStart)}; falta marcar o fim.` : " Pause no começo e no fim dela e marque."}
              </p>
            )}
            {skip.intro?.source !== "chapters" && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => saveMarks({ introStart: now })} className="flex-1 rounded border border-border px-2 py-1.5 hover:border-accent">Início aqui</button>
                <button onClick={() => saveMarks({ introEnd: now })} className="flex-1 rounded border border-border px-2 py-1.5 hover:border-accent">Fim aqui</button>
              </div>
            )}
          </div>
          <div>
            <p className="font-medium">Encerramento</p>
            {skip.outro ? (
              <p className="text-xs text-neutral-400">
                a partir de {fmt(skip.outro.start)} · {skip.outro.source === "chapters" ? "detectado pelos capítulos do arquivo" : "marcado por você (vale para a série)"}
              </p>
            ) : (
              <p className="text-xs text-neutral-400">
                Não detectado.{dur > 300 ? ` O botão de próximo episódio aparece nos últimos ${FALLBACK_OUTRO_SECONDS} s.` : " Marque onde ele começa."}
              </p>
            )}
            {skip.outro?.source !== "chapters" && (
              <button onClick={() => saveMarks({ outroStart: now })} className="mt-2 w-full rounded border border-border px-2 py-1.5 hover:border-accent">Início do encerramento aqui</button>
            )}
          </div>
          {(skip.marks.introStart != null || skip.marks.introEnd != null || skip.marks.outroStart != null) && (
            <button onClick={clearMarks} className="text-xs text-neutral-400 underline hover:text-white">Limpar marcas</button>
          )}
        </div>
      )}

      {/* Controles próprios: iguais em qualquer navegador e sem o botão de tela cheia do <video>,
          que não leva a legenda junto (o Firefox não permite esconder o nativo). */}
      {streamUrl && (
        <div
          className={`absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-8 text-white transition-opacity sm:gap-3 ${uiVisible || !playing ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <button onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproduzir"} title="Reproduzir/pausar (espaço)" className="flex size-9 shrink-0 items-center justify-center rounded text-xl hover:bg-white/15">
            {playing ? "⏸" : "▶"}
          </button>
          <span className="w-12 shrink-0 text-right text-xs tabular-nums sm:w-14 sm:text-sm">{fmt(now)}</span>
          <input
            type="range"
            aria-label="Posição do vídeo"
            aria-valuetext={`${fmt(now)} de ${fmt(dur)}`}
            min={0}
            max={dur || 0}
            step={0.1}
            value={Math.min(now, dur || 0)}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.target.value);
              setNow(Number(e.target.value));
            }}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
          />
          <span className="w-12 shrink-0 text-xs tabular-nums text-neutral-300 sm:w-14 sm:text-sm">{fmt(dur)}</span>
          <button
            onClick={() => {
              const v = videoRef.current;
              if (v) v.muted = !v.muted;
            }}
            aria-label={muted || volume === 0 ? "Ativar som" : "Silenciar"}
            title="Silenciar (m)"
            className="flex size-9 shrink-0 items-center justify-center rounded hover:bg-white/15"
          >
            {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = videoRef.current;
              if (!v) return;
              v.volume = Number(e.target.value);
              v.muted = Number(e.target.value) === 0;
            }}
            className="hidden w-20 shrink-0 cursor-pointer accent-[var(--accent)] sm:block"
          />
          <button onClick={toggleFullscreen} aria-label="Tela cheia" title="Tela cheia (f)" className="flex size-9 shrink-0 items-center justify-center rounded text-lg hover:bg-white/15">
            ⛶
          </button>
        </div>
      )}

      {showIntroButton && (
        <button onClick={skipIntro} className="absolute bottom-24 right-4 z-10 rounded border border-white/40 bg-black/70 px-5 py-3 font-medium text-white shadow-lg backdrop-blur hover:bg-black/90">
          Pular abertura ⏭
        </button>
      )}
      {showNextButton && nextHref && (
        <Link href={nextHref} onClick={goNext} className="absolute bottom-24 right-4 z-10 rounded bg-accent px-5 py-3 font-medium text-white shadow-lg">
          Próximo episódio ▶
        </Link>
      )}
    </div>
  );
}
