// Wiederholungs-Editor: die Felder, die man für „jeden Dienstag und Donnerstag", „letzter Freitag
// im Monat" oder „bis Jahresende" braucht – ohne eine Zeile RRULE zu kennen. Rechnen und
// Übersetzen macht recurrenceBuilder.ts; hier wird nur gezeichnet und eingesammelt.
import { App, Modal } from "obsidian";
import { RecurSpec, RecurUnit, RecurEnd, defaultSpec, ruleToSpec, specToRule, upcomingDates } from "./recurrenceBuilder";
import { describeRecurrence } from "./recurrenceText";
import { firstOccurrence } from "./recurrence";
import { openDatePicker } from "./datePicker";
import { addDays, dateOf, formatDate, todayStr } from "./format";
import { t, getLocale } from "./i18n";

export interface RecurrenceEdit { rule: string; basis: "due" | "done"; }

const UNITS: RecurUnit[] = ["day", "week", "month", "year"];
const POSITIONS = [1, 2, 3, 4, -1];

/** Kurzer Wochentagsname aus Intl (rrule-Zählung 0 = Mo; der 01.01.2024 war ein Montag). */
function shortDay(i: number): string {
  return new Intl.DateTimeFormat(getLocale(), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)));
}
function longDay(i: number): string {
  return new Intl.DateTimeFormat(getLocale(), { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i)));
}

export class RecurrenceModal extends Modal {
  private spec: RecurSpec;
  private basis: "due" | "done";
  /** Gespeicherte Regel, die der Editor nicht abbilden kann (fremde App, Handarbeit). Sie bleibt
   *  unangetastet, solange niemand ein Feld ändert – Speichern ohne Änderung ersetzt sie nicht. */
  private raw: string | null;
  private dirty = false;
  private previewEl!: HTMLElement;

  constructor(app: App, private init: { rule: string | null; basis: "due" | "done"; due: string | null },
              private onSave: (r: RecurrenceEdit) => void) {
    super(app);
    const today = todayStr();
    const parsed = init.rule ? ruleToSpec(init.rule, init.due, today) : null;
    this.raw = init.rule && !parsed ? init.rule : null;
    this.spec = parsed ?? defaultSpec(init.due, today);
    this.basis = init.basis;
  }

  onOpen(): void {
    this.modalEl.addClass("bt-new-modal");
    this.modalEl.addClass("bt-recur-modal");
    this.render();
  }

  onClose(): void { this.contentEl.empty(); }

  /** Eine Änderung: merken, dass gespeichert werden darf, und neu zeichnen (oder nur die Vorschau). */
  private change(full = true): void {
    this.dirty = true;
    if (full) this.render(); else this.updatePreview();
  }

  private render(): void {
    const c = this.contentEl;
    c.empty();
    c.createEl("h3", { text: t("recur_edit_title") });
    if (this.raw && !this.dirty) {
      c.createDiv({ cls: "bt-recur-ed-note", text: t("recur_ed_raw", describeRecurrence(this.raw)) });
    }
    const s = this.spec;

    // ── Einheit + Intervall: „alle [2] [Wochen]" ──
    const every = this.field(c, t("recur_ed_every"));
    const line = every.createDiv({ cls: "bt-recur-ed-line" });
    const num = line.createEl("input", { type: "number", cls: "bt-new-input bt-recur-ed-num", attr: { min: "1", max: "99", "aria-label": t("recur_ed_every") } });
    num.value = String(s.interval);
    num.oninput = () => { const n = parseInt(num.value, 10); s.interval = n > 0 ? Math.min(n, 99) : 1; this.change(false); };
    this.segmented(line, UNITS.map((u) => ({ id: u, label: t("recur_unit_" + u) })), s.unit, (u) => { s.unit = u; this.change(); });

    // ── Woche: Tage ──
    if (s.unit === "week") {
      const f = this.field(c, t("recur_ed_on_days"));
      const row = f.createDiv({ cls: "bt-recur-ed-days" });
      for (let i = 0; i < 7; i++) {
        const on = s.weekdays.includes(i);
        const b = row.createEl("button", { cls: "bt-recur-ed-day" + (on ? " is-on" : ""), text: shortDay(i), attr: { "aria-pressed": String(on), "aria-label": longDay(i) } });
        b.onclick = () => {
          // Mindestens ein Tag: Eine Woche ohne Tag hätte keinen Termin.
          if (on && s.weekdays.length === 1) return;
          s.weekdays = on ? s.weekdays.filter((d) => d !== i) : [...s.weekdays, i].sort((a, b2) => a - b2);
          this.change();
        };
      }
    }

    // ── Monat: am Tag N oder am n-ten Wochentag ──
    if (s.unit === "month") {
      const f = this.field(c, t("recur_ed_month"));
      this.segmented(f, [{ id: "day" as const, label: t("recur_ed_month_day") }, { id: "weekday" as const, label: t("recur_ed_month_weekday") }],
        s.monthMode, (m) => { s.monthMode = m; this.change(); });
      const row = f.createDiv({ cls: "bt-recur-ed-line" });
      if (s.monthMode === "day") {
        const d = row.createEl("input", { type: "number", cls: "bt-new-input bt-recur-ed-num", attr: { min: "1", max: "31", "aria-label": t("recur_ed_month_day") } });
        d.value = String(s.monthDay);
        d.oninput = () => { const n = parseInt(d.value, 10); s.monthDay = n >= 1 && n <= 31 ? n : 1; this.change(false); };
      } else {
        const pos = row.createEl("select", { cls: "dropdown bt-recur-ed-select" });
        for (const p of POSITIONS) pos.createEl("option", { value: String(p), text: t(p === -1 ? "recur_pos_last" : "recur_pos_" + p) });
        pos.value = String(s.setPos);
        pos.onchange = () => { s.setPos = parseInt(pos.value, 10); this.change(false); };
        const wd = row.createEl("select", { cls: "dropdown bt-recur-ed-select" });
        for (let i = 0; i < 7; i++) wd.createEl("option", { value: String(i), text: longDay(i) });
        wd.value = String(s.setWeekday);
        wd.onchange = () => { s.setWeekday = parseInt(wd.value, 10); this.change(false); };
      }
    }

    // ── Ende ──
    const endF = this.field(c, t("recur_ed_end"));
    this.segmented(endF, [
      { id: "never" as const, label: t("recur_end_never") },
      { id: "until" as const, label: t("recur_end_until") },
      { id: "count" as const, label: t("recur_end_count") },
    ], s.end.kind, (k) => { s.end = this.defaultEnd(k); this.change(); });
    if (s.end.kind === "until") {
      const end = s.end;
      const btn = endF.createEl("button", { cls: "bt-recur-ed-date-btn", text: formatDate(end.date) });
      btn.onclick = () => openDatePicker(btn, end.date, (v) => { if (v) { s.end = { kind: "until", date: dateOf(v) }; this.change(); } });
    } else if (s.end.kind === "count") {
      const end = s.end;
      const row = endF.createDiv({ cls: "bt-recur-ed-line" });
      const n = row.createEl("input", { type: "number", cls: "bt-new-input bt-recur-ed-num", attr: { min: "1", max: "999", "aria-label": t("recur_end_count") } });
      n.value = String(end.count);
      n.oninput = () => { const v = parseInt(n.value, 10); s.end = { kind: "count", count: v > 0 ? v : 1 }; this.change(false); };
      row.createSpan({ cls: "bt-recur-ed-unit", text: t("recur_end_times") });
    }

    // ── Ab Erledigung zählen (Schalter wie in den übrigen Dialogen) ──
    const basisRow = c.createDiv({ cls: "bt-new-row" });
    basisRow.createEl("label", { text: t("recur_when_done") });
    const sw = basisRow.createDiv({ cls: "bt-mrow-switch" + (this.basis === "done" ? " is-on" : ""), attr: { role: "switch", "aria-checked": String(this.basis === "done"), tabindex: "0" } });
    const flip = (): void => { this.basis = this.basis === "done" ? "due" : "done"; this.change(); };
    sw.onclick = flip;
    sw.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };

    this.previewEl = c.createDiv({ cls: "bt-recur-ed-preview" });
    this.updatePreview();

    const foot = c.createDiv({ cls: "bt-foot" });
    foot.createDiv();
    const acts = foot.createDiv({ cls: "bt-actions" });
    acts.createEl("button", { text: t("btn_cancel") }).onclick = () => this.close();
    const ok = acts.createEl("button", { cls: "mod-cta", text: t("btn_save") });
    ok.onclick = () => {
      // Unveränderte Fremd-Regel: nichts ersetzen (s. raw).
      if (!(this.raw && !this.dirty)) this.onSave({ rule: specToRule(this.spec), basis: this.basis });
      this.close();
    };
  }

  /** Klartext der Regel + die nächsten Termine – so sieht man vor dem Speichern, was gemeint ist. */
  private updatePreview(): void {
    const el = this.previewEl;
    el.empty();
    const rule = specToRule(this.spec);
    el.createDiv({ cls: "bt-recur-ed-desc", text: describeRecurrence(rule) + (this.basis === "done" ? " · " + t("recur_when_done") : "") });
    const today = todayStr();
    const first = firstOccurrence(rule, this.init.due ?? today);
    const dates = first ? upcomingDates(rule, first, 5) : [];
    if (!dates.length) return;
    el.createDiv({ cls: "bt-recur-ed-dates-h", text: t("recur_ed_preview") });
    const list = el.createDiv({ cls: "bt-recur-ed-dates" });
    for (const d of dates) list.createSpan({ cls: "bt-recur-ed-date", text: formatDate(d, today) });
  }

  private defaultEnd(kind: RecurEnd["kind"]): RecurEnd {
    if (kind === "until") return { kind, date: addDays(this.init.due ?? todayStr(), 90) };
    if (kind === "count") return { kind, count: 10 };
    return { kind: "never" };
  }

  private field(parent: HTMLElement, label: string): HTMLElement {
    const f = parent.createDiv({ cls: "bt-new-field" });
    f.createEl("label", { text: label });
    return f;
  }

  /** Umschalter aus Knöpfen (eine Wahl aus wenigen). */
  private segmented<T extends string>(parent: HTMLElement, items: { id: T; label: string }[], active: T, onPick: (id: T) => void): void {
    const seg = parent.createDiv({ cls: "bt-recur-ed-seg" });
    for (const it of items) {
      const b = seg.createEl("button", { cls: "bt-recur-ed-segbtn" + (it.id === active ? " is-active" : ""), text: it.label, attr: { "aria-pressed": String(it.id === active) } });
      b.onclick = () => { if (it.id !== active) onPick(it.id); };
    }
  }
}
