import { SiteHeader } from "@/components/SiteHeader";

/** Catálogo, título e configurações: barra fixa e conteúdo com margens. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="flex-1 px-[var(--gut)] py-6">{children}</main>
    </>
  );
}
