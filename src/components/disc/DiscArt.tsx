import type { CSSProperties } from "react";
import { CATEGORY_LABEL } from "@/lib/category";
import { sized } from "@/lib/images";
import type { CardTitle } from "@/lib/home-types";

/** Texto em arco do disco: nome, ano e categoria, como na impressão de um CD de verdade. */
export function discLabel(t: Pick<CardTitle, "name" | "year" | "category">): string {
  return `${t.name}  ·  ${t.year ?? ""}  ·  ${CATEGORY_LABEL[t.category]}`.toUpperCase().slice(0, 52);
}

/** Definição do arco usada por todos os discos da página (renderize uma vez). */
export function ArcDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <path id="dc-arc" d="M60,60 m-30.5,0 a30.5,30.5 0 1,1 61,0 a30.5,30.5 0 1,1 -61,0" />
      </defs>
    </svg>
  );
}

export function DiscArt({ cover, label }: { cover: string | null; label: string }) {
  const img = sized(cover, "w780");
  const style = { "--art": img ? `url(${JSON.stringify(img)})` : "none" } as CSSProperties;
  return (
    <span className="dc-dart" style={style}>
      <svg className="arc" viewBox="0 0 120 120" aria-hidden="true">
        <text>
          <textPath href="#dc-arc">{label}</textPath>
        </text>
      </svg>
    </span>
  );
}
