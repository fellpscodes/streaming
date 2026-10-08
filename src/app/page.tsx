import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ContinueRow } from "@/components/ContinueRow";
import { listContinueWatching } from "@/lib/progress";

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <Suspense fallback={<div className="h-48 animate-pulse rounded bg-surface" aria-busy="true" />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}

async function HomeContent() {
  await connection();
  const items = listContinueWatching();
  return (
    <>
      <ContinueRow items={items} />
      {items.length === 0 && (
        <p className="rounded border border-dashed border-border p-8 text-center text-sm text-neutral-400">
          Nada em andamento.{" "}
          <Link href="/catalogo" className="text-accent underline">Escolha algo no catálogo</Link>.
        </p>
      )}
    </>
  );
}
