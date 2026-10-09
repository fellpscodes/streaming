import { SiteHeader } from "@/components/SiteHeader";

/** Início: cabeçalho transparente sobre a prévia, conteúdo de ponta a ponta. */
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader overlay />
      <main id="conteudo" className="flex-1">{children}</main>
    </>
  );
}
