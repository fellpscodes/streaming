"use client";

import Link from "next/link";
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
  nextHref: string | null;
  startAt: number;
}

type JassubInstance = { destroy: () => Promise<void> | void };

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export function Player({ episodeId, title, subtitle, backHref, nextHref, startAt }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // 2) Lista de legendas (uma vez); escolhe a padrão ou a primeira em português.
  useEffect(() => {
    fetch(`/api/subtitles/${episodeId}`)
      .then((r) => r.json())
      .then((d: { tracks: SubTrack[]; fonts: string[] }) => {
        setSubs(d);
        const pick = d.tracks.find((t) => t.isDefault) ?? d.tracks.find((t) => /portugu/i.test(t.label));
        setSubId(pick?.id ?? "");
      })
      .catch(() => setSubs({ tracks: [], fonts: [] }));
  }, [episodeId]);

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

  // 4) Progresso: a cada 10 s tocando, ao pausar, ao sair da aba.
  const save = useCallback(
    (beacon = false) => {
      const v = videoRef.current;
      if (!v || !v.duration || !Number.isFinite(v.duration)) return;
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

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen();
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
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  function poke() {
    setUiVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => !videoRef.current?.paused && setUiVisible(false), 3000);
  }

  const sel = "rounded bg-black/70 px-2 py-1 text-sm text-white outline-none focus:ring-2 focus:ring-accent";

  return (
    <div
      ref={wrapRef}
      onMouseMove={poke}
      onTouchStart={poke}
      className={`relative flex aspect-video max-h-[calc(100vh-3.5rem)] w-full items-center justify-center bg-black ${uiVisible ? "" : "cursor-none"}`}
    >
      {streamUrl && (
        <video
          ref={videoRef}
          key={streamUrl}
          src={streamUrl}
          controls
          controlsList="nofullscreen"
          playsInline
          preload="auto"
          onLoadedMetadata={onLoadedMetadata}
          onError={onVideoError}
          onPause={() => (save(), setUiVisible(true))}
          onPlay={() => (setEnded(false), poke())}
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
            <select aria-label="Legenda" value={subId} onChange={(e) => setSubId(e.target.value)} className={sel}>
              <option value="">💬 Sem legenda</option>
              {subs.tracks.map((t) => <option key={t.id} value={t.id}>💬 {t.label}</option>)}
            </select>
          )}
          <button onClick={toggleFullscreen} className={sel} aria-label="Tela cheia">⛶</button>
        </div>
      </div>

      {ended && nextHref && (
        <Link href={nextHref} className="absolute bottom-20 right-4 rounded bg-accent px-5 py-3 font-medium text-white shadow-lg">
          Próximo episódio ▶
        </Link>
      )}
    </div>
  );
}
