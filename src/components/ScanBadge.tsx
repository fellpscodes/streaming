"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ScanState } from "@/lib/scanner/state";

const LABEL: Partial<Record<ScanState["phase"], string>> = {
  walking: "Procurando arquivos",
  saving: "Processando",
  metadata: "Buscando capas",
};

/** Mostra em qualquer página que há uma varredura em andamento e atualiza a tela quando ela termina. */
export function ScanBadge() {
  const router = useRouter();
  const [scan, setScan] = useState<ScanState | null>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    const es = new EventSource("/api/scan/events");
    es.onmessage = (e) => {
      const s: ScanState = JSON.parse(e.data);
      setScan(s);
      if (wasRunning.current && !s.running) router.refresh(); // novos títulos apareceram
      wasRunning.current = s.running;
    };
    return () => es.close();
  }, [router]);

  if (!scan?.running) return null;
  const pct = scan.total && scan.phase !== "walking" ? ` ${Math.round((scan.processed / scan.total) * 100)}%` : "";
  return (
    <Link
      href="/configuracoes"
      role="status"
      className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-neutral-200 hover:border-accent"
    >
      <span className="size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" aria-hidden />
      <span className="hidden sm:inline">{LABEL[scan.phase] ?? "Escaneando"}{pct}</span>
      <span className="sm:hidden">Escaneando</span>
    </Link>
  );
}
