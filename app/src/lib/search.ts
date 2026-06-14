// search.ts — typo-tolerant fuzzy search (fuse.js), replacing the hand-rolled matcher. Used for
// finding her foods, recipes, restaurants. Weighted keys let name beat brand.

import Fuse, { type IFuseOptions } from 'fuse.js';

type Key<T> = Extract<keyof T, string> | { name: Extract<keyof T, string>; weight: number };

/** Ranked fuzzy matches for `query` over `items`. Empty query → []. */
export function fuzzy<T>(query: string, items: T[], keys: Key<T>[], limit = 8): T[] {
  const q = query.trim();
  if (!q || !items.length) return [];
  const opts: IFuseOptions<T> = { keys: keys as IFuseOptions<T>['keys'], threshold: 0.4, ignoreLocation: true, minMatchCharLength: 1 };
  return new Fuse(items, opts)
    .search(q, { limit })
    .map((r) => r.item);
}
