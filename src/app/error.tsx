"use client";

import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-md flex-1 px-4 py-16 text-center" role="alert">
        <h1 className="text-xl font-bold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted">{error.message || "Erro inesperado ao carregar esta página."}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className="rounded-[3px] bg-foreground px-5 py-2.5 text-sm font-extrabold text-black">Tentar de novo</button>
          <Link href="/" className="rounded-[3px] border border-border px-5 py-2.5 text-sm hover:border-foreground">Início</Link>
        </div>
      </main>
    </>
  );
}
