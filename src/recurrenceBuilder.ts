import { RRule } from "rrule";
import { ruleOptions, FREQ_UNIT, Rule } from "./recurrence";

/**
 * Der Wiederholungs-Editor (recurrenceModal.ts) denkt in Feldern – „alle 2 Wochen, Di und Do, bis
 * Jahresende" –, gespeichert wird weiter RRULE (s. recurrence.ts). Diese Datei übersetzt zwischen
 * beidem, rein und ohne Oberfläche.
 *
 * `ruleToSpec` liefert `null`, wenn eine Regel mehr sagt, als der Editor ausdrücken kann (etwa
 * BYSETPOS oder BYMONTH aus einer fremden App). Der Editor zeigt dann den Rohtext statt einer
 * Näherung, die beim Speichern die Regel stillschweigend verändern würde.
 */

export type RecurUnit = Rule["unit"];
export type RecurEnd = { kind: "never" } | { kind: "until"; date: string } | { kind: "count"; count: number };

export interface RecurSpec {
  unit: RecurUnit;
  interval: number;          // ≥ 1
  /** Wochentage, rrule-Zählung 0 = Mo … 6 = So. Nur bei `week`; leer = Wochentag der Fälligkeit. */
  weekdays: number[];
  /** Monat: an einem festen Tag („am 15.") oder an einem Wochentag („letzter Freitag"). */
  monthMode: "day" | "weekday";
  monthDay: number;          // 1–31
  setPos: number;            // 1–4 oder -1 (= letzter)
  setWeekday: number;        // 0 = Mo … 6 = So
  end: RecurEnd;
}

const WD_CODE = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const FREQ_NAME: Record<RecurUnit, string> = { day: "DAILY", week: "WEEKLY", month: "MONTHLY", year: "YEARLY" };

const z = (n: number): string => String(n).padStart(2, "0");
const toIso = (d: Date): string => d.getUTCFullYear() + "-" + z(d.getUTCMonth() + 1) + "-" + z(d.getUTCDate());
const fromIso = (iso: string): Date => new Date(iso.slice(0, 10) + "T00:00:00Z");

/** Wochentag eines Datums in rrule-Zählung (0 = Mo). */
export const weekdayOf = (iso: string): number => (fromIso(iso).getUTCDay() + 6) % 7;

/** Vorbelegung aus der Fälligkeit: wöchentlich an ihrem Wochentag, im Monat an ihrem Tag bzw. an
 *  ihrem n-ten Wochentag. `fallback` (heute) gilt, wenn die Aufgabe noch kein Datum hat. */
export function defaultSpec(dueIso: string | null, fallback: string): RecurSpec {
  const iso = dueIso || fallback;
  const tag = fromIso(iso).getUTCDate();
  const pos = Math.ceil(tag / 7);
  return {
    unit: "week", interval: 1, weekdays: [weekdayOf(iso)],
    monthMode: "day", monthDay: tag, setPos: pos > 4 ? -1 : pos, setWeekday: weekdayOf(iso),
    end: { kind: "never" },
  };
}

/** Editor-Felder -> RRULE. Nur was gilt, steht drin (INTERVAL=1 und leere Teile fallen weg). */
export function specToRule(spec: RecurSpec): string {
  const parts = ["FREQ=" + FREQ_NAME[spec.unit]];
  const n = Math.max(1, Math.floor(spec.interval) || 1);
  if (n > 1) parts.push("INTERVAL=" + n);
  if (spec.unit === "week" && spec.weekdays.length) {
    parts.push("BYDAY=" + [...new Set(spec.weekdays)].sort((a, b) => a - b).map((d) => WD_CODE[d]).join(","));
  }
  if (spec.unit === "month") {
    if (spec.monthMode === "weekday") parts.push("BYDAY=" + spec.setPos + WD_CODE[spec.setWeekday]);
    else parts.push("BYMONTHDAY=" + Math.min(31, Math.max(1, Math.floor(spec.monthDay) || 1)));
  }
  if (spec.end.kind === "until") parts.push("UNTIL=" + spec.end.date.slice(0, 10).replace(/-/g, ""));
  if (spec.end.kind === "count") parts.push("COUNT=" + Math.max(1, Math.floor(spec.end.count) || 1));
  return parts.join(";");
}

/** byweekday einheitlich als {n, wd}: rrule liefert Zahlen ODER Weekday-Objekte. */
function weekdays(v: unknown): { n: number | null; wd: number }[] | null {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  const out: { n: number | null; wd: number }[] = [];
  for (const x of arr) {
    if (typeof x === "number") { out.push({ n: null, wd: x }); continue; }
    const o = x as { weekday?: number; n?: number | null };
    if (typeof o?.weekday !== "number") return null;
    out.push({ n: o.n ?? null, wd: o.weekday });
  }
  return out;
}

const filled = (v: unknown): boolean => (Array.isArray(v) ? v.length > 0 : v != null);

/** RRULE -> Editor-Felder. `null` = mit dem Editor nicht ausdrückbar (dann bleibt der Rohtext). */
export function ruleToSpec(rule: string, dueIso: string | null, fallback: string): RecurSpec | null {
  const o = ruleOptions(rule);
  if (!o || o.freq === undefined) return null;
  const unit = FREQ_UNIT.get(o.freq);
  if (!unit) return null;
  // Was der Editor nicht kennt, macht die Regel für ihn unbearbeitbar.
  if (filled(o.bysetpos) || filled(o.bymonth) || filled(o.byyearday) || filled(o.byweekno)
    || filled(o.byhour) || filled(o.byminute) || filled(o.bysecond)) return null;
  const wds = weekdays(o.byweekday);
  if (!wds) return null;
  const mdays: unknown[] = Array.isArray(o.bymonthday) ? o.bymonthday : o.bymonthday != null ? [o.bymonthday] : [];

  const spec = defaultSpec(dueIso, fallback);
  spec.unit = unit;
  spec.interval = o.interval && o.interval > 0 ? o.interval : 1;
  if (unit === "week") {
    if (mdays.length || wds.some((w) => w.n != null)) return null;
    // Schlichtes FREQ=WEEKLY wiederholt sich am Wochentag der Fälligkeit – genau den zeigt der
    // Editor dann markiert (defaultSpec), statt keinen Tag, was nach „nie" aussähe.
    if (wds.length) spec.weekdays = [...new Set(wds.map((w) => w.wd))].sort((a, b) => a - b);
  } else if (unit === "month") {
    if (wds.length === 1 && wds[0].n != null && !mdays.length) {
      if (wds[0].n === 0 || wds[0].n > 4 || wds[0].n < -1) return null;
      spec.monthMode = "weekday"; spec.setPos = wds[0].n; spec.setWeekday = wds[0].wd;
    } else if (!wds.length && mdays.length === 1 && typeof mdays[0] === "number" && mdays[0] > 0) {
      spec.monthMode = "day"; spec.monthDay = mdays[0];
    } else if (wds.length || mdays.length) return null;
    // Schlichtes FREQ=MONTHLY: Tag der Fälligkeit, wie defaultSpec ihn schon gesetzt hat.
  } else if (wds.length || mdays.length) return null;

  if (o.until instanceof Date) spec.end = { kind: "until", date: toIso(o.until) };
  else if (typeof o.count === "number") spec.end = { kind: "count", count: o.count };
  else spec.end = { kind: "never" };
  return spec;
}

/** Die nächsten `n` Termine einer Regel ab `fromIso` (einschliesslich) – für die Vorschau im Editor. */
export function upcomingDates(rule: string, fromIsoDate: string, n: number): string[] {
  const o = ruleOptions(rule);
  if (!o) return [];
  try {
    return new RRule({ ...o, dtstart: fromIso(fromIsoDate) }).all((_d, i) => i < n).map(toIso);
  } catch { return []; }
}
