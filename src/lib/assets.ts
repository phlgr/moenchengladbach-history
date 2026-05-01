/** Prepend Vite's base URL so assets resolve correctly on GitHub Pages subpaths. */
export function path(p: string) {
  const base =
    (import.meta as { env?: { BASE_URL: string } }).env?.BASE_URL ?? "/";
  return `${base}${p.replace(/^\//, "")}`;
}
