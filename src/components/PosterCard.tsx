import Link from "next/link";
import { Poster } from "./Poster";

interface Props {
  id: number;
  name: string;
  year: number | null;
  posterUrl: string | null;
  rating?: number | null;
}

export function PosterCard({ id, name, year, posterUrl, rating }: Props) {
  return (
    <Link
      href={`/titulo/${id}`}
      className="group block w-full overflow-hidden rounded-md bg-surface ring-accent transition focus-visible:ring-2 sm:hover:-translate-y-1 sm:hover:ring-2"
    >
      <Poster src={posterUrl} title={name} className="w-full" />
      <div className="p-2">
        <p className="truncate text-sm font-medium" title={name}>{name}</p>
        <p className="flex justify-between text-xs text-neutral-400">
          <span>{year ?? "—"}</span>
          {rating != null && <span>★ {rating.toFixed(1)}</span>}
        </p>
      </div>
    </Link>
  );
}
