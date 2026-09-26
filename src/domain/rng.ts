/**
 * Deterministic PRNG (mulberry32). Used to distribute remainder chips by
 * chance while keeping tests reproducible. Stored on the match so history
 * never changes after the fact.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick `count` distinct items from `items` using the provided RNG. */
export function pickDistinct<T>(items: readonly T[], count: number, random: () => number): T[] {
  const pool = [...items];
  const chosen: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(random() * pool.length);
    const [item] = pool.splice(idx, 1);
    if (item !== undefined) chosen.push(item);
  }
  return chosen;
}
