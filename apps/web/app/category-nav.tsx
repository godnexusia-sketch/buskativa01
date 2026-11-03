import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@buskativa/core/categories";
import { CategoryIcon } from "./icons";

/** Horizontal category rail (scrolls sideways on phones). */
export function CategoryNav({ current = null, counts }: { current?: CategoryId | null; counts?: Partial<Record<CategoryId, number>> }) {
  const ids = CATEGORY_IDS.filter((id) => id !== "outros");
  return (
    <nav className="catnav" aria-label="Categorias">
      <a className={`catnav-item ${current === null ? "sel" : ""}`} href="/ofertas" aria-current={current === null ? "page" : undefined}>
        <CategoryIcon id="outros" />
        <span>Tudo</span>
      </a>
      {ids.map((id) => (
        <a
          key={id}
          className={`catnav-item ${current === id ? "sel" : ""}`}
          href={`/ofertas?categoria=${id}`}
          aria-current={current === id ? "page" : undefined}
        >
          <CategoryIcon id={id} />
          <span>{CATEGORIES[id].name}</span>
          {counts?.[id] ? <small>{counts[id]}</small> : null}
        </a>
      ))}
    </nav>
  );
}
