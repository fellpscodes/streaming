import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Não encontrado · Streaming" };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto flex-1 max-w-md px-4 py-16 text-center">
        <p className="text-5xl font-black text-accent-fg">404</p>
        <h1 className="mt-3 text-xl font-bold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted">Esse título ou episódio pode ter sido removido do catálogo.</p>
        <Link href="/catalogo" className="mt-6 inline-block rounded-[3px] bg-foreground px-5 py-2.5 text-sm font-extrabold text-black">Ir para o catálogo</Link>
      </main>
    </>
  );
}
