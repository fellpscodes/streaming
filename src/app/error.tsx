"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center" role="alert">
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-neutral-400">{error.message || "Erro inesperado ao carregar esta página."}</p>
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={reset} className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-white">Tentar de novo</button>
        <Link href="/" className="rounded border border-border px-5 py-2.5 text-sm hover:border-accent">Início</Link>
      </div>
    </div>
  );
}
