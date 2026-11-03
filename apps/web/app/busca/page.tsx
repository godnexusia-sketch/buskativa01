import { SearchResults } from "./search-results";

export default async function BuscaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  if (q.length < 2) return <p>Digite o que você procura no campo acima.</p>;
  return (
    <>
      <h1>Resultados para “{q}”</h1>
      <SearchResults q={q} />
    </>
  );
}
