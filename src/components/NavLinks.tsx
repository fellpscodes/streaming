"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Início", match: (p: string) => p === "/" },
  { href: "/catalogo", label: "Catálogo", match: (p: string) => p.startsWith("/catalogo") || p.startsWith("/titulo") },
  { href: "/configuracoes", label: "Configurações", match: (p: string) => p.startsWith("/configuracoes") },
];

const base = "border-b-2 py-1 font-medium transition-colors";
const idle = `${base} border-transparent text-[#c9c7c2] hover:text-white`;

/** Menu sem destaque da página atual: aparece enquanto a rota dinâmica ainda resolve. */
export function NavLinksFallback() {
  return (
    <nav aria-label="Principal" className="flex flex-wrap gap-x-5 gap-y-1 text-sm sm:gap-x-7 sm:text-[15px]">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={idle}>{l.label}</Link>
      ))}
    </nav>
  );
}

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex flex-wrap gap-x-5 gap-y-1 text-sm sm:gap-x-7 sm:text-[15px]">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={active ? `${base} border-accent text-white` : idle}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
