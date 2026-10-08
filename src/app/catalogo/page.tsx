import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { PosterCard } from "@/components/PosterCard";
import { CATEGORY_LABEL, filterOptions, listTitles } from "@/lib/catalog";
import type { Category } from "@/lib/db";
import { getScanState } from "@/lib/scanner/state";

export const metadata = { title: "Catálogo · Streaming" };

const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function CatalogoPage(props: PageProps<"/catalogo">) {
  return (
    <Suspense fallback={<GridSkeleton />}>
      <Catalogo searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Catalogo({ searchParams }: { searchParams: PageProps<"/catalogo">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const cat = one(sp.categoria);
  const category = CATEGORIES.includes(cat as Category) ? (cat as Category) : undefined;
  const q = one(sp.q) ?? "";
  const genre = one(sp.genero) ?? "";
  const year = Number(one(sp.ano)) || undefined;

  const { genres, years } = filterOptions(category);
  const items = listTitles({ category, q, genre: genre || undefined, year });
  const total = listTitles().length;
  const filtered = Boolean(q || genre || year);

  const tab = (c?: Category) => {
    const active = c === category;
    return (
      <Link
        key={c ?? "all"}
        href={c ? `/catalogo?categoria=${c}` : "/catalogo"}
        aria-current={active ? "page" : undefined}
        className={`rounded-full px-4 py-1.5 text-sm ${active ? "bg-accent text-white" : "bg-surface text-neutral-300 hover:text-white"}`}
      >
        {c ? CATEGORY_LABEL[c] : "Tudo"}
      </Link>
    );
  };

  const input = "rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-semibold">Catálogo</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Categorias">
        {tab(undefined)}
        {CATEGORIES.map((c) => tab(c))}
      </nav>

      <form className="flex flex-wrap gap-2" role="search">
        {category && <input type="hidden" name="categoria" value={category} />}
        <input name="q" defaultValue={q} placeholder="Buscar título…" aria-label="Buscar" className={`${input} min-w-0 flex-1 basis-48`} />
        <select name="genero" defaultValue={genre} aria-label="Gênero" className={input}>
          <option value="">Todos os gêneros</option>
          {genres.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select name="ano" defaultValue={year ?? ""} aria-label="Ano" className={input}>
          <option value="">Todos os anos</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        <button className="rounded bg-accent px-4 py-2 text-sm font-medium text-white">Filtrar</button>
        {(filtered) && (
          <Link href={category ? `/catalogo?categoria=${category}` : "/catalogo"} className="px-2 py-2 text-sm text-neutral-400 hover:text-white">
            Limpar
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <div className="rounded border border-dashed border-border p-10 text-center text-sm text-neutral-400" role="status">
          {total === 0 && getScanState().running ? (
            "Varredura em andamento… os títulos aparecem aqui assim que forem encontrados."
          ) : total === 0 ? (
            <>
              Seu catálogo está vazio.{" "}
              <Link href="/configuracoes" className="text-accent-fg underline">Configure uma pasta e rode o scan.</Link>
            </>
          ) : filtered ? (
            "Nenhum título encontrado com esses filtros."
          ) : (
            `Nenhum título em ${category ? CATEGORY_LABEL[category] : "Tudo"} ainda.`
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-400">{items.length} título(s)</p>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((t) => (
              <li key={t.id}>
                <PosterCard id={t.id} name={t.name} year={t.year} posterUrl={t.posterUrl} rating={t.rating} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="mx-auto max-w-7xl" aria-busy="true" aria-label="Carregando catálogo">
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-surface" />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => <li key={i} className="aspect-[2/3] animate-pulse rounded bg-surface" />)}
      </ul>
    </div>
  );
}
