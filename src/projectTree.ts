// Unterprojekte: Ein Projekt kann einem Projekt oder einem Bereich untergeordnet sein. Gespeichert
// wird das in SEINER Notiz als `parent: "[[Name]]"` – dieselbe Form wie bei Unteraufgaben, also
// ein echter Link (Backlinks, Graph) und umbenennungsfest über den Basenamen.
//
// Genau zwei Ebenen: Bereich/Projekt -> Unterprojekt. Was sich daran nicht hält, wird nicht
// verworfen, sondern nach oben geholt – lieber sichtbar als verschwunden (wie bei readSections):
//  – nur PROJEKTE können Kind sein; ein Bereich mit `parent` bleibt oben;
//  – der Elter muss existieren und darf nicht der Eintrag selbst sein;
//  – hängt der Elter selbst an jemandem (dritte Ebene, Ring), bleibt das Kind oben.
// Archiviert ist ein Unterprojekt auch, wenn sein Elter es ist: Der ganze Zweig ruht.
//
// Rein (kein obsidian-Import) und damit vollständig testbar.

/** Was die Verknüpfung über einen Eintrag wissen muss. */
export interface TreeNode {
  name: string;
  path: string;
  type: "project" | "area";
  archived: boolean;
  /** Roh-Verweis aus dem Frontmatter: kleingeschriebener Basename des Elters (s. parentKeyOf). */
  parentKey: string | null;
}

/** Ergebnis der Verknüpfung je Eintrag. */
export interface TreeLink {
  /** Pfad des wirksamen Elters, null = oberste Ebene. */
  parent: string | null;
  /** Selbst archiviert ODER unter einem archivierten Elter. */
  inArchive: boolean;
}

/** `parent`-Wert einer Projektnotiz -> kleingeschriebener Basename. Versteht „[[Name]]",
 *  „[[Ordner/Name|Alias]]", blanken Text und eine Liste (dann zählt der erste Eintrag – so legt
 *  Obsidians Eigenschaften-Panel einen Link manchmal ab). */
export function parentKeyOf(raw: unknown): string | null {
  const v = Array.isArray(raw) ? (raw as unknown[]).find((x) => typeof x === "string") : raw;
  if (typeof v !== "string") return null;
  const m = v.match(/\[\[([^\]|#]+)/);
  const name = (m ? m[1] : v).trim().split("/").pop()!.replace(/\.md$/i, "").trim();
  return name ? name.toLowerCase() : null;
}

/** Wirksame Eltern und Archiv-Zustand für alle Einträge (Schlüssel = Pfad). */
export function linkTree(items: readonly TreeNode[]): Map<string, TreeLink> {
  const byName = new Map<string, TreeNode>();
  for (const it of items) { const k = it.name.toLowerCase(); if (!byName.has(k)) byName.set(k, it); }
  const raw = (it: TreeNode): TreeNode | null => {
    if (it.type !== "project" || !it.parentKey) return null;
    const p = byName.get(it.parentKey);
    return p && p !== it ? p : null;
  };
  const out = new Map<string, TreeLink>();
  for (const it of items) {
    const p = raw(it);
    const eff = p && !raw(p) ? p : null;   // Elter mit eigenem Elter -> dritte Ebene -> oben bleiben
    out.set(it.path, { parent: eff?.path ?? null, inArchive: it.archived || !!eff?.archived });
  }
  return out;
}

/** Minimalform eines verknüpften Eintrags für die Abfragen unten. */
export interface Linked { path: string; parent: string | null }

/** Kinder eines Eintrags, in der Reihenfolge der Eingabe. */
export function childrenOf<T extends Linked>(items: readonly T[], path: string): T[] {
  return items.filter((x) => x.parent === path);
}

/** Der ganze Zweig: der Eintrag selbst, dann seine Kinder. */
export function branchPaths(items: readonly Linked[], path: string): string[] {
  return [path, ...childrenOf(items, path).map((x) => x.path)];
}

/** Baum flach legen: jeder oberste Eintrag, gefolgt von seinen Kindern. `kids` liefert die Kinder
 *  in der gewünschten Reihenfolge (die Seitenleiste sortiert sie anders als ein Picker). */
export function flattenTree<T>(tops: readonly T[], kids: (t: T) => readonly T[]): { item: T; depth: 0 | 1 }[] {
  const out: { item: T; depth: 0 | 1 }[] = [];
  for (const top of tops) {
    out.push({ item: top, depth: 0 });
    for (const k of kids(top)) out.push({ item: k, depth: 1 });
  }
  return out;
}

/** Kann `child` unter `candidate` hängen? Nur Projekte werden Kind, nur oberste Einträge Elter,
 *  und wer selbst Kinder hat, bleibt oben – sonst entstünde eine dritte Ebene. */
export function canAdopt<T extends Linked & { type: "project" | "area" }>(items: readonly T[], candidate: T, child: T): boolean {
  if (candidate.path === child.path || child.type !== "project") return false;
  if (candidate.parent !== null) return false;
  return !items.some((x) => x.parent === child.path);
}

/** Alle Einträge, unter die `child` gehängt werden kann (Reihenfolge der Eingabe). */
export function parentCandidates<T extends Linked & { type: "project" | "area" }>(items: readonly T[], child: T): T[] {
  return items.filter((c) => canAdopt(items, c, child));
}
