import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavLinksFallback } from "./NavLinks";
import { ScanBadge } from "./ScanBadge";

/**
 * Cabeçalho do site. Na Home (`overlay`) fica transparente por cima da prévia; nas outras páginas é uma barra fixa.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header
      className={`z-40 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 px-[var(--gut)] py-[18px] ${
        overlay
          ? "fixed inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent"
          : "sticky top-0 border-b border-border bg-background/90 backdrop-blur"
      }`}
    >
      <Link href="/" className="text-[22px] font-black leading-none tracking-[-0.04em] text-foreground">
        Streaming
      </Link>
      <div className="flex items-center gap-4 sm:gap-6">
        <ScanBadge />
        <Suspense fallback={<NavLinksFallback />}>
          <NavLinks />
        </Suspense>
      </div>
    </header>
  );
}
