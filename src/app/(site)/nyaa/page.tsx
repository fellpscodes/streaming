import { Suspense } from "react";
import { connection } from "next/server";
import { NyaaClient } from "@/components/NyaaClient";

export const metadata = { title: "Buscar no Nyaa · Streaming" };

export default function NyaaPage(props: PageProps<"/nyaa">) {
  return (
    <Suspense fallback={<div className="mx-auto h-64 max-w-[1200px] animate-pulse rounded bg-surface" aria-busy="true" aria-label="Carregando" />}>
      <Nyaa searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Nyaa({ searchParams }: { searchParams: PageProps<"/nyaa">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const q = one(sp.q);
  // A página fica montada ao navegar para outra tela. A chave (busca + `n`, o carimbo de cada clique em "Buscar no Nyaa")
  // recria o componente, para a busca nova valer mesmo se ele já estava aberto com outra pesquisa.
  return <NyaaClient key={`${q}|${one(sp.n)}`} initialQuery={q} />;
}
