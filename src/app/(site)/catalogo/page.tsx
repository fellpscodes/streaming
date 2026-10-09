import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { CatalogGrid } from "@/components/disc/CatalogGrid";
import { CATEGORY_LABEL, filterOptions, listTitles } from "@/lib/catalog";
import type { Category } from "@/lib/db";
import { toCards } from "@/lib/home";
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
        className={`border-b-2 py-1 font-medium transition-colors ${active ? "border-accent text-white" : "border-transparent text-[#c9c7c2] hover:text-white"}`}
      >
        {c ? CATEGORY_LABEL[c] : "Tudo"}
      </Link>
    );
  };

  const input = "rounded-[3px] border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground";

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <h1 className="text-4xl font-black tracking-[-0.04em]">Catálogo</h1>
      <nav className="flex flex-wrap gap-x-7 gap-y-2" aria-label="Categorias">
        {tab(undefined)}
        {CATEGORIES.map((c) => tab(c))}
      </nav>

      <form className="flex flex-wrap gap-2" role="search">
        {category && <input type="hidden" name="categoria" value={category} />}
        <input name="q" defaultValue={q} placeholder="Buscar título" aria-label="Buscar" className={`${input} min-w-0 flex-1 basis-48`} />
        <select name="genero" defaultValue={genre} aria-label="Gênero" className={input}>
          <option value="">Todos os gêneros</option>
          {genres.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select name="ano" defaultValue={year ?? ""} aria-label="Ano" className={input}>
          <option value="">Todos os anos</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
        <button className="rounded-[3px] bg-foreground px-5 py-2 text-sm font-extrabold text-black hover:bg-white">Filtrar</button>
        {filtered && (
          <Link href={category ? `/catalogo?categoria=${category}` : "/catalogo"} className="px-2 py-2 text-sm text-muted hover:text-white">
            Limpar
          </Link>
        )}
      </form>

      {items.length === 0 ? (
        <div className="rounded border border-dashed border-border p-10 text-center text-sm text-muted" role="status">
          {total === 0 && getScanState().running ? (
            "Varredura em andamento. Os títulos aparecem aqui assim que forem encontrados."
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
          <p className="text-sm text-muted">{items.length} título(s)</p>
          <CatalogGrid titles={toCards(items)} />
        </>
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px]" aria-busy="true" aria-label="Carregando catálogo">
      <div className="mb-6 h-10 w-48 animate-pulse rounded bg-surface" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-6">
        {Array.from({ length: 12 }, (_, i) => <div key={i} className="aspect-[142/125] animate-pulse rounded bg-surface" />)}
      </div>
    </div>
  );
}
