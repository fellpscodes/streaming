import Link from "next/link";
import { ReviewClient } from "@/components/ReviewClient";

export const metadata = { title: "Correção manual · Streaming" };

export default function CorrecaoPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/configuracoes" className="text-sm text-neutral-400 hover:text-white">← Configurações</Link>
      <h1 className="mb-6 mt-2 text-4xl font-black tracking-[-0.04em]">Correção manual</h1>
      <ReviewClient />
    </div>
  );
}
