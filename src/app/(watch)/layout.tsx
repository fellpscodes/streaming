/** Assistir: tela inteira, sem cabeçalho. */
export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return <main id="conteudo" className="flex-1">{children}</main>;
}
