/**
 * Abschnitte (und Unterabschnitte) eines Projekts bzw. Bereichs.
 *
 * Ein Abschnitt ist KEINE Aufgabe, sondern ein Teil des Projekts mit eigenem Namen, eigener
 * Beschreibung und eigenen Aufgaben. Gespeichert wird er im Frontmatter der Projektnotiz:
 *
 *   sections:
 *     - id: s-k3j2
 *       name: Design
 *       description: Entwürfe und UI-Kit
 *     - id: s-p9x1
 *       name: Wireframes
 *       parent: s-k3j2
 *
 * Die Aufgabe verweist mit `section: s-p9x1` darauf. Warum über eine Kennung und nicht über den
 * Namen: Umbenennen fasst so keine einzige Aufgabe an, und zwei Unterabschnitte „Backlog" unter
 * verschiedenen Abschnitten bleiben unterscheidbar. Die Kennung gilt nur INNERHALB des Projekts –
 * eine Projektvorlage kann sie deshalb unverändert mitnehmen.
 *
 * Zwei Ebenen (Abschnitt › Unterabschnitt), mehr nicht: tiefer verschachtelt würde aus der
 * Gliederung ein zweiter Aufgabenbaum neben dem der Unteraufgaben.
 *
 * Rein (ohne App/DOM) und damit vollständig testbar.
 */

export interface SectionDef {
  id: string;
  name: string;
  description: string;
  /** Kennung des übergeordneten Abschnitts; `null` = oberste Ebene. */
  parent: string | null;
}

/** Ein Abschnitt in Anzeige-Reihenfolge: Eltern direkt gefolgt von ihren Unterabschnitten. */
export interface SectionEntry { def: SectionDef; depth: 0 | 1; }

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/**
 * Frontmatter-Wert -> Abschnitte, bereinigt. Bewusst nachsichtig: Was von Hand oder aus einer
 * fremden Quelle kommt, soll nicht verschwinden, sondern auf eine gültige Form gebracht werden.
 *   • ohne Kennung oder doppelt -> verworfen (eine Kennung trägt die Zuordnung der Aufgaben)
 *   • Eltern unbekannt, man selbst, oder selbst schon Unterabschnitt -> wird oberste Ebene
 * Die Reihenfolge wird zur Anzeige-Reihenfolge normalisiert (s. orderedSections).
 */
export function readSections(raw: unknown): SectionDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const defs: SectionDef[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = str(o.id).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const parent = str(o.parent).trim();
    defs.push({ id, name: str(o.name).trim() || id, description: str(o.description).replace(/\s+$/, ""), parent: parent || null });
  }
  const byId = new Map(defs.map((d) => [d.id, d]));
  for (const d of defs) {
    const p = d.parent ? byId.get(d.parent) : undefined;
    if (!p || p.id === d.id || p.parent) d.parent = null;
  }
  return flatten(defs);
}

/** Ein Abschnitt, wie er im Frontmatter (und im JSON-Export) steht. */
export interface StoredSection { id: string; name: string; description?: string; parent?: string; }

/** Abschnitte -> Frontmatter-Wert. Leere Felder fallen weg, damit die Notiz lesbar bleibt. */
export function writeSections(defs: readonly SectionDef[]): StoredSection[] {
  return flatten(defs).map((d) => {
    const o: StoredSection = { id: d.id, name: d.name };
    if (d.description.trim()) o.description = d.description;
    if (d.parent) o.parent = d.parent;
    return o;
  });
}

/** Anzeige-Reihenfolge: jede oberste Ebene, direkt gefolgt von ihren Unterabschnitten. */
function flatten(defs: readonly SectionDef[]): SectionDef[] {
  const out: SectionDef[] = [];
  for (const top of defs) {
    if (top.parent) continue;
    out.push(top);
    for (const kid of defs) if (kid.parent === top.id) out.push(kid);
  }
  return out;
}

export function orderedSections(defs: readonly SectionDef[]): SectionEntry[] {
  return flatten(defs).map((def) => ({ def, depth: def.parent ? 1 : 0 }));
}

export const findSection = (defs: readonly SectionDef[], id: string | null | undefined): SectionDef | null =>
  id ? defs.find((d) => d.id === id) ?? null : null;

/** „Design › Wireframes" – für Auswahl-Listen und Zeilen außerhalb der Projektseite. */
export function sectionLabel(defs: readonly SectionDef[], id: string | null | undefined): string | null {
  const d = findSection(defs, id);
  if (!d) return null;
  const p = findSection(defs, d.parent);
  return p ? p.name + " › " + d.name : d.name;
}

/** Neue Kennung, im Projekt eindeutig. `rand` hereingereicht -> testbar. */
export function newSectionId(defs: readonly SectionDef[], rand: () => string = () => Math.random().toString(36).slice(2, 8)): string {
  let id = "";
  do { id = "s-" + rand(); } while (!id || defs.some((d) => d.id === id));
  return id;
}

/** Abschnitt anlegen – oben ans Ende, als Unterabschnitt ans Ende seiner Geschwister. */
export function addSection(defs: readonly SectionDef[], name: string, parent: string | null = null, description = "",
                           rand?: () => string): { defs: SectionDef[]; id: string } {
  const id = newSectionId(defs, rand);
  const p = findSection(defs, parent);
  // Unter einem Unterabschnitt geht es nicht tiefer – dann wird er Geschwister seines Elters.
  const parentId = p ? (p.parent ?? p.id) : null;
  const neu: SectionDef = { id, name: name.trim() || id, description, parent: parentId };
  return { defs: flatten([...defs, neu]), id };
}

export function renameSection(defs: readonly SectionDef[], id: string, name: string): SectionDef[] {
  const n = name.trim();
  return defs.map((d) => (d.id === id && n ? { ...d, name: n } : d));
}

export function setSectionDescription(defs: readonly SectionDef[], id: string, description: string): SectionDef[] {
  return defs.map((d) => (d.id === id ? { ...d, description: description.replace(/\s+$/, "") } : d));
}

/** Einen Platz nach oben (-1) bzw. unten (+1) unter seinen GESCHWISTERN; Unterabschnitte wandern
 *  mit ihrem Elter. Am Rand passiert nichts. */
export function moveSection(defs: readonly SectionDef[], id: string, dir: -1 | 1): SectionDef[] {
  const d = findSection(defs, id);
  if (!d) return [...defs];
  const sibs = defs.filter((x) => x.parent === d.parent);
  const i = sibs.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return flatten(defs);
  const order = [...sibs];
  [order[i], order[j]] = [order[j], order[i]];
  // Neu aufbauen: die getauschte Geschwisterfolge, alle anderen an ihrem Platz.
  const rest = defs.filter((x) => x.parent !== d.parent);
  return flatten(d.parent ? [...rest, ...order] : [...order, ...rest]);
}

/**
 * Abschnitt entfernen – samt seiner Unterabschnitte. `reassign` sagt, wohin die Aufgaben der
 * entfernten Abschnitte gehen: zum Elter des entfernten Abschnitts bzw. `null` (ohne Abschnitt).
 * Ob sie stattdessen in den Papierkorb gehen, entscheidet der Aufrufer (Rückfrage).
 */
export function removeSection(defs: readonly SectionDef[], id: string): { defs: SectionDef[]; reassign: Map<string, string | null> } {
  const d = findSection(defs, id);
  const reassign = new Map<string, string | null>();
  if (!d) return { defs: [...defs], reassign };
  const ziel = d.parent;
  reassign.set(d.id, ziel);
  for (const kid of defs) if (kid.parent === d.id) reassign.set(kid.id, ziel);
  return { defs: flatten(defs.filter((x) => !reassign.has(x.id))), reassign };
}

/** Abschnitte einer Vorlage in ein bestehendes Projekt übernehmen: unbekannte Kennungen kommen
 *  hinzu, bekannte bleiben, wie das Projekt sie hat. */
export function mergeSections(base: readonly SectionDef[], add: readonly SectionDef[]): SectionDef[] {
  const known = new Set(base.map((d) => d.id));
  return readSections(writeSections([...base, ...add.filter((d) => !known.has(d.id))]));
}

/**
 * Aufgaben nach Abschnitten ordnen – für Liste und Board der Projektseite.
 *
 * `sectionOf` liefert den WIRKSAMEN Abschnitt einer Aufgabe (bei Unteraufgaben der ihrer
 * Hauptaufgabe, s. Aufrufer). Unbekannte Kennungen zählen als „ohne Abschnitt". Leere Abschnitte
 * bleiben drin – genau dort will man ja die erste Aufgabe anlegen. Die Gruppe „ohne Abschnitt"
 * steht vorn und fehlt, wenn sie leer ist.
 */
export interface SectionGroup<T> { key: string; def: SectionDef | null; depth: 0 | 1; tasks: T[]; }

export function groupBySection<T>(tasks: readonly T[], defs: readonly SectionDef[], sectionOf: (t: T) => string | null): SectionGroup<T>[] {
  const known = new Set(defs.map((d) => d.id));
  const buckets = new Map<string, T[]>();
  const loose: T[] = [];
  for (const tk of tasks) {
    const s = sectionOf(tk);
    if (s && known.has(s)) {
      const arr = buckets.get(s);
      if (arr) arr.push(tk); else buckets.set(s, [tk]);
    } else loose.push(tk);
  }
  const out: SectionGroup<T>[] = [];
  if (loose.length) out.push({ key: "", def: null, depth: 0, tasks: loose });
  for (const e of orderedSections(defs)) out.push({ key: e.def.id, def: e.def, depth: e.depth, tasks: buckets.get(e.def.id) ?? [] });
  return out;
}
