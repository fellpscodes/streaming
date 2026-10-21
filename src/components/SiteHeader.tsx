import Link from "next/link";
import { Suspense } from "react";
import { HeaderBar } from "./HeaderBar";
import { NavLinks, NavLinksFallback } from "./NavLinks";
import { ScanBadge } from "./ScanBadge";

/**
 * Cabeçalho do site. Na Home (`overlay`) fica por cima da prévia com um véu escuro; nas outras páginas é uma barra fixa.
 * Nos dois casos, ao rolar a página, ganha fundo translúcido com desfoque.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <HeaderBar overlay={overlay} className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 px-[var(--gut)] py-[18px]">
      <Link href="/" className="text-[22px] font-black leading-none tracking-[-0.04em] text-foreground">
        Streaming
      </Link>
      <div className="flex items-center gap-4 sm:gap-6">
        <ScanBadge />
        <Suspense fallback={<NavLinksFallback />}>
          <NavLinks />
        </Suspense>
      </div>
    </HeaderBar>
  );
}
