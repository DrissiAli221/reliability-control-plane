const SECTIONS: Record<string, string> = { "": "Overview", monitors: "Monitors", pipeline: "Pipeline" };

/** Where am I, as a path: `rcp / monitors / 3f2a9c1e`. Unknown routes show their first segment as-is. */
export function crumbs(pathname: string): { label: string; to?: string }[] {
  const [section = "", id] = pathname.split("/").filter(Boolean).length
    ? pathname.split("/").filter(Boolean)
    : [""];
  const trail: { label: string; to?: string }[] = [{ label: "rcp", to: "/" }];
  trail.push({ label: SECTIONS[section] ?? section, to: id ? `/${section}` : undefined });
  if (id) trail.push({ label: id.slice(0, 8).toLowerCase() });
  return trail;
}
