import type { ChecklistItem } from "./types";

/**
 * Checkliste einer Aufgabe: schlichte Punkte zum Abhaken – anders als Unteraufgaben KEINE eigenen
 * Notizen, sondern ein Feld im Frontmatter der Aufgabe:
 *
 *   checklist:
 *     - "[x] Eingang leeren"
 *     - "[ ] Kalender prüfen"
 *
 * ── Warum Frontmatter und nicht `- [ ]` im Body ──────────────────────────────────
 * Checkboxen im Body hielten das Tasks-Plugin und Markdown-Apps wie TaskForge für eigene Aufgaben –
 * jeder Punkt stünde dort als Aufgabe. Im Frontmatter liest der Index sie ohne Datei-Zugriff, und
 * Kopien (Duplizieren, Vorlagen, Wiederholung) nehmen sie mit, ohne einen zweiten Schreibweg.
 *
 * Diese Datei ist rein (ohne App/DOM) und damit vollständig testbar.
 */

/** `[ ]`/`[x]` vorn, optional mit Listenzeichen davor (Einfügen aus Markdown). */
const LINE = /^\s*(?:[-*+]\s+)?\[([ xX])\]\s?(.*)$/;
/** Listenzeichen ohne Checkbox („- Milch") – beim Einfügen ebenso ein Punkt. */
const BULLET = /^\s*[-*+]\s+/;

/** Ein Rohwert -> Punkt. `null` = leer bzw. nicht verwertbar. Bewusst nachsichtig: Was jemand von
 *  Hand ins Frontmatter schreibt, soll nicht stillschweigend verschwinden. */
export function parseChecklistItem(raw: unknown): ChecklistItem | null {
  if (typeof raw === "string") {
    const m = raw.match(LINE);
    const text = (m ? m[2] : raw.replace(BULLET, "")).trim();
    return text ? { text, done: !!m && m[1] !== " " } : null;
  }
  if (typeof raw === "number" || typeof raw === "boolean") return { text: String(raw), done: false };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    return text ? { text, done: o.done === true || o.done === "x" || o.done === "true" } : null;
  }
  return null;
}

/** Frontmatter-Wert -> Punkte. Fehlt das Feld, ist die Checkliste leer. */
export function parseChecklist(raw: unknown): ChecklistItem[] {
  if (raw == null || raw === "") return [];
  const arr: unknown[] = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split("\n") : [raw];
  return arr.map(parseChecklistItem).filter((x): x is ChecklistItem => x !== null);
}

/** Ein Punkt in seiner gespeicherten Form. */
export const serializeChecklistItem = (it: ChecklistItem): string => (it.done ? "[x] " : "[ ] ") + it.text.trim();

/** Punkte -> Frontmatter-Wert. Leere Punkte fallen weg; eine leere Liste entfernt der Schreiber. */
export function serializeChecklist(items: readonly ChecklistItem[] | undefined): string[] {
  return (items ?? []).filter((it) => it.text.trim() !== "").map(serializeChecklistItem);
}

/** Alle Punkte wieder offen – für jede Kopie, die wie ihre Aufgabe „offen" startet. */
export const resetChecklist = (items: readonly ChecklistItem[] | undefined): ChecklistItem[] =>
  (items ?? []).map((it) => ({ text: it.text, done: false }));

/** Fortschritt für Badge und Kopfzeile. `null` = keine Checkliste. */
export function checklistProgress(items: readonly ChecklistItem[] | undefined): { done: number; total: number } | null {
  const total = items?.length ?? 0;
  if (!total) return null;
  return { done: items!.filter((it) => it.done).length, total };
}

/** Eingefügter (auch mehrzeiliger) Text -> Punkte. Jede nicht leere Zeile wird ein Punkt;
 *  `- [x] …` aus Markdown behält dabei seinen Zustand. */
export function itemsFromText(text: string): ChecklistItem[] {
  return text.split(/\r?\n/).map(parseChecklistItem).filter((x): x is ChecklistItem => x !== null);
}

/**
 * Einen Punkt abhaken bzw. öffnen, aber nur, wenn an `index` noch DERSELBE Punkt steht.
 *
 * Das Badge in der Liste schreibt direkt in die Notiz. Hat sich die Checkliste dazwischen geändert
 * (anderes Gerät, Editor), träfe ein blinder Index den falschen Punkt. Dann wird nach dem Text
 * gesucht; fehlt auch der, bleibt alles, wie es ist (`null`).
 */
export function setItemDone(items: readonly ChecklistItem[], index: number, text: string, done: boolean): ChecklistItem[] | null {
  const i = items[index]?.text === text ? index : items.findIndex((it) => it.text === text);
  if (i < 0) return null;
  const out = items.map((it) => ({ ...it }));
  out[i] = { ...out[i], done };
  return out;
}

/** Zwei Checklisten inhaltlich gleich? (Signaturen, unnötiges Schreiben vermeiden.) */
export const sameChecklist = (a: readonly ChecklistItem[] | undefined, b: readonly ChecklistItem[] | undefined): boolean =>
  serializeChecklist(a).join("\n") === serializeChecklist(b).join("\n");
