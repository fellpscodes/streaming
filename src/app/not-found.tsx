import Link from "next/link";

export const metadata = { title: "Não encontrado · Streaming" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl font-bold text-accent-fg">404</p>
      <h1 className="mt-3 text-xl font-semibold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-neutral-400">Esse título ou episódio pode ter sido removido do catálogo.</p>
      <Link href="/catalogo" className="mt-6 inline-block rounded bg-accent px-5 py-2.5 text-sm font-medium text-white">Ir para o catálogo</Link>
    </div>
  );
}
