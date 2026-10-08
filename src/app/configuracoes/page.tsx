import { SettingsClient } from "@/components/SettingsClient";

export const metadata = { title: "Configurações · Streaming" };

export default function ConfiguracoesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold">Configurações</h1>
      <SettingsClient />
    </div>
  );
}
