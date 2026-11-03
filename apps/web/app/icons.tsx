import type { CategoryId } from "@buskativa/core/categories";

// 24×24 stroke icons; paths drawn for this site
const CATEGORY_PATHS: Record<CategoryId, string> = {
  smartphones: "M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2",
  notebooks: "M5 5.5h14v10H5zM2.5 18.5h19",
  computadores: "M3.5 4.5h17v11h-17zM9 20h6M12 15.5V20",
  componentes: "M7 7h10v10H7zM10 10h4v4h-4zM10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5",
  perifericos: "M12 3.5a5 5 0 0 1 5 5v7a5 5 0 0 1-10 0v-7a5 5 0 0 1 5-5zM12 7v3",
  monitores: "M3 4.5h18v12H3zM8.5 20.5h7M12 16.5v4",
  tvs: "M2.5 6.5h19v12h-19zM8 3l4 3.5L16 3",
  audio: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z",
  games: "M7 8.5h10a4.5 4.5 0 0 1 0 9c-1.6 0-2.4-1.5-3.2-2.5h-3.6C9.4 16 8.6 17.5 7 17.5a4.5 4.5 0 0 1 0-9zM7.5 11.5v3M6 13h3M15.5 12h.01M17.5 14h.01",
  tablets: "M6 2.5h12A1.5 1.5 0 0 1 19.5 4v16a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5zM12 18.5h.01",
  smartwatches: "M8.5 6.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM9 6.5 9.5 2.5h5l.5 4M9 17.5l.5 4h5l.5-4M12 9.5V12l1.5 1.5",
  eletrodomesticos: "M6.5 2.5h11v19h-11zM6.5 9.5h11M9 5.5v1.5M9 12.5v3",
  cozinha: "M4 10.5h16v2a8 8 0 0 1-16 0zM12 3v4M8.5 4.5v2.5M15.5 4.5v2.5",
  casa: "M3.5 11 12 4l8.5 7M6 9.5v10h12v-10M10 19.5v-5h4v5",
  beleza: "M9 2.5h6v5H9zM8 7.5h8l1 14H7z",
  acessorios: "M9 2.5v5M15 2.5v5M7 7.5h10v4a5 5 0 0 1-10 0zM12 16.5v5",
  esportes: "M3 9.5v5M6 7.5v9M18 7.5v9M21 9.5v5M6 12h12",
  moda: "M9 3.5 4 6l1.5 4.5L7.5 10v10.5h9V10l2 .5L20 6l-5-2.5a3 3 0 0 1-6 0z",
  automotivo: "M5 16.5h14M6.5 16.5V19M17.5 16.5V19M4.5 16.5v-4l2-5h11l2 5v4zM7.5 13h.01M16.5 13h.01",
  outros: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
};

export function CategoryIcon({ id, size = 22 }: { id: CategoryId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CATEGORY_PATHS[id]} />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#6a2bff" />
      <circle cx="226" cy="222" r="118" fill="none" stroke="#fff" strokeWidth="44" />
      <path d="M312 308 L404 400" stroke="#fff" strokeWidth="56" strokeLinecap="round" />
      <path d="M168 170 h76 l58 58 -76 76 -58 -58 z" fill="#fff" />
      <circle cx="196" cy="198" r="14" fill="#6a2bff" />
    </svg>
  );
}
