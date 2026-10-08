"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Início", match: (p: string) => p === "/" },
  { href: "/catalogo", label: "Catálogo", match: (p: string) => p.startsWith("/catalogo") || p.startsWith("/titulo") },
  { href: "/configuracoes", label: "Configurações", match: (p: string) => p.startsWith("/configuracoes") },
];

/** Menu sem destaque da página atual: aparece enquanto a rota dinâmica ainda resolve. */
export function NavLinksFallback() {
  return (
    <nav aria-label="Principal" className="flex gap-4 text-sm sm:gap-5">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="pb-0.5 text-neutral-400 hover:text-white">{l.label}</Link>
      ))}
    </nav>
  );
}

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-4 text-sm sm:gap-5">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={active ? "border-b-2 border-accent pb-0.5 text-white" : "pb-0.5 text-neutral-400 hover:text-white"}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
