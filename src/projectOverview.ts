import { Task } from "./types";
import { FilterRange, addDays } from "./filterEngine";
import { isDone, isTrashed } from "./statuses";

/**
 * Zahlen für den Überblick über EIN Projekt bzw. einen Bereich (s. overviewBlock.ts) – rein, ohne
 * App, damit testbar.
 *
 * Gezählt werden ALLE Aufgaben des Projekts außer dem Papierkorb, Unteraufgaben eingeschlossen:
 * Eine Unteraufgabe ist Arbeit im Projekt wie jede andere, und der Fortschritt „12/18" soll das
 * zeigen, was man im Projekt tatsächlich abhaken kann.
 *
 * Die Zeit-Zähler überschneiden sich NICHT (überfällig · heute · nächste 7 Tage ab morgen · ohne
 * Datum) – sonst ergäben „2 überfällig · 5 heute" zusammen mehr Aufgaben, als da sind. Maßgeblich
 * ist die Fälligkeit (`due`), wie beim Zeitraum-Filter, auf den ein Klick auf den Zähler schaltet.
 */
export interface ProjectStats {
  total: number;
  done: number;
  open: number;
  /** 0–100, gerundet. Ohne Aufgaben 0. */
  progress: number;
  overdue: number;
  today: number;
  week: number;
  noDate: number;
}

export function projectStats(tasks: readonly Task[], today: string): ProjectStats {
  const live = tasks.filter((t) => !isTrashed(t.status));
  const done = live.filter((t) => isDone(t.status)).length;
  const open = live.filter((t) => !isDone(t.status));
  const weekEnd = addDays(today, 7);
  let overdue = 0, heute = 0, week = 0, noDate = 0;
  for (const t of open) {
    if (!t.due) noDate++;
    else if (t.due < today) overdue++;
    else if (t.due === today) heute++;
    else if (t.due <= weekEnd) week++;
  }
  return {
    total: live.length, done, open: open.length,
    progress: live.length ? Math.round((done / live.length) * 100) : 0,
    overdue, today: heute, week, noDate,
  };
}

/** Auf welchen Zeitraum-Filter der Seite ein Zähler schaltet (s. filterEngine.inRange). */
export const COUNTER_RANGE: Record<"overdue" | "today" | "week" | "noDate", FilterRange> = {
  overdue: "overdue", today: "today", week: "next7", noDate: "nodate",
};

/** Ein Eintrag unter „Als Nächstes": die Aufgabe, das Datum, um das es geht, und ob es eine Frist ist. */
export interface NextItem { task: Task; date: string; time: string | null; deadline: boolean; overdue: boolean; }

/**
 * Die nächsten offenen Aufgaben des Projekts nach ihrem FRÜHESTEN Datum – Fälligkeit oder Frist,
 * je nachdem, was eher kommt. So steht eine Frist morgen vor einer Fälligkeit nächste Woche, auch
 * wenn dieselbe Aufgabe erst später eingeplant ist. Überfälliges zuerst, Undatiertes nie.
 */
export function nextTasks(tasks: readonly Task[], today: string, limit = 5): NextItem[] {
  const items: NextItem[] = [];
  for (const t of tasks) {
    if (isTrashed(t.status) || isDone(t.status)) continue;
    const kandidaten: { date: string; time: string | null; deadline: boolean }[] = [];
    if (t.due) kandidaten.push({ date: t.due, time: t.dueTime, deadline: false });
    if (t.scheduled) kandidaten.push({ date: t.scheduled, time: t.scheduledTime, deadline: true });
    if (!kandidaten.length) continue;
    const k = kandidaten.sort((a, b) => a.date.localeCompare(b.date) || Number(a.deadline) - Number(b.deadline))[0];
    items.push({ task: t, ...k, overdue: k.date < today });
  }
  return items
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || a.task.title.localeCompare(b.task.title))
    .slice(0, limit);
}

/** Den Body einer Notiz ohne Frontmatter – und ohne eine führende `# Überschrift`, die nur den
 *  Projektnamen wiederholt (ältere Projektnotizen tragen sie noch, s. createProjectNote). */
export function noteInfoBody(content: string, name: string): string {
  const fm = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  let body = fm ? content.slice(fm[0].length) : content;
  const h1 = body.match(/^\s*#\s+(.+?)\s*#*\s*(?:\r?\n|$)/);
  if (h1 && h1[1].trim().toLowerCase() === name.trim().toLowerCase()) body = body.slice(h1[0].length);
  return body.replace(/^\s+|\s+$/g, "");
}

/** Frontmatter einer Notiz (inkl. abschließendem `---`), sonst "". Fürs Zurückschreiben des Bodys. */
export function frontmatterBlock(content: string): string {
  const fm = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return fm ? fm[0] : "";
}
