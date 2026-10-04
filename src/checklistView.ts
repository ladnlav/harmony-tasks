// Checklisten-Sektion im Aufgaben-Modal – aufgebaut wie die Unteraufgaben-Sektion (subtaskList.ts):
// Kopfzeile mit Fortschritt, abhakbare Zeilen, Inline-Erfassung. Sie nutzt dieselben Klassen
// (.bt-sec-head, .bt-st-row, .bt-st-add …), damit beide Sektionen als eine Familie lesen.
//
// Anders als die Unteraufgaben (eigene Notizen, live geschrieben) ist die Checkliste ein FELD der
// Aufgabe: Die Sektion arbeitet auf dem Entwurf des Modals, gespeichert wird mit der Aufgabe.
// Deshalb geht sie auch bei einer neuen, noch nicht angelegten Aufgabe.
import { setIcon } from "obsidian";
import type BeautyTasksPlugin from "./main";
import { ChecklistItem, Task } from "./types";
import { checklistProgress, itemsFromText } from "./checklist";
import { attachRowDrag } from "./manageView";
import { openPopover } from "./popover";
import { t } from "./i18n";
import { tip } from "./tooltip";

/** Was das Modal beisteuert: den Entwurf lesen und ersetzen. */
export interface ChecklistHost {
  items(): ChecklistItem[];
  set(items: ChecklistItem[]): void;
}

export class ChecklistView {
  private wrap!: HTMLElement;
  private input: HTMLInputElement | null = null;
  private collapsed = false;   // nur für die Lebensdauer des Modals
  private hideDone = false;
  private revealed = false;    // per „+"-Menü angefordert (auch ohne Punkte)

  constructor(private host: ChecklistHost) {}

  mount(wrap: HTMLElement): void {
    this.wrap = wrap;
    this.render();
  }

  /** Getippten, nicht mit Enter bestätigten Punkt beim Schliessen übernehmen (wie bei den
   *  Unteraufgaben – das Feld hat bewusst keinen eigenen Senden-Button). */
  flushDraft(): void {
    const raw = this.input?.value ?? "";
    if (raw.trim()) { if (this.input) this.input.value = ""; this.add(raw); }
  }

  /** Sektion einblenden und den Cursor in die Erfassung setzen („+" -> „Checkliste hinzufügen"). */
  focusComposer(): void {
    this.revealed = true;
    this.collapsed = false;
    this.render();
    this.input?.focus();
  }

  private update(items: ChecklistItem[]): void {
    this.host.set(items);
    this.render();
  }

  private add(raw: string): void {
    const neu = itemsFromText(raw);
    if (neu.length) this.update([...this.host.items(), ...neu]);
  }

  render(): void {
    const wrap = this.wrap;
    const items = this.host.items();
    const show = items.length > 0 || this.revealed;
    wrap.toggleClass("bt-hidden", !show);
    if (!show) { wrap.empty(); this.input = null; return; }

    const draft = this.input?.value ?? "";
    const hadFocus = !!this.input && this.input === activeDocument.activeElement;
    wrap.empty();

    if (items.length) {
      const p = checklistProgress(items)!;
      const head = wrap.createDiv({ cls: "bt-sec-head" });
      const toggleBtn = head.createEl("button", { cls: "bt-sec-toggle", attr: { "aria-expanded": String(!this.collapsed) } });
      setIcon(toggleBtn.createSpan({ cls: "bt-sec-caret" }), this.collapsed ? "chevron-right" : "chevron-down");
      toggleBtn.createSpan({ cls: "bt-sec-title", text: t("checklist") });
      toggleBtn.createSpan({ cls: "bt-sec-count", text: p.done + "/" + p.total });
      toggleBtn.onclick = () => { this.collapsed = !this.collapsed; this.render(); };
      if (p.done) {
        const sw = head.createEl("button", { cls: "bt-sec-act", text: this.hideDone ? t("panel_show_done") : t("subs_hide_done") });
        sw.onclick = () => { this.hideDone = !this.hideDone; this.render(); };
      }
      if (this.collapsed) { this.input = null; return; }
    }

    const body = wrap.createDiv({ cls: "bt-st-body bt-cl-body" });
    const rows = body.createDiv({ cls: "bt-cl-rows" });
    items.forEach((it, i) => {
      if (this.hideDone && it.done) return;
      this.renderRow(rows, it, i);
    });
    this.renderComposer(body, draft, hadFocus);
  }

  private renderRow(rows: HTMLElement, it: ChecklistItem, i: number): void {
    const row = rows.createDiv({ cls: "bt-st-row bt-cl-row" + (it.done ? " is-done" : "") });
    const grip = row.createSpan({ cls: "bt-cl-grip" });
    tip(grip, t("menu_reorder"));
    setIcon(grip, "grip-vertical");
    // data-key = Index im Entwurf. attachRowDrag liefert beim Loslassen die neue Reihenfolge der
    // Schlüssel; ausgeblendete (erledigte) Punkte behalten dabei ihren Platz.
    row.setAttr("data-key", String(i));
    attachRowDrag(row, grip, rows, (keys) => this.reorder(keys.map(Number)));

    const box = row.createSpan({ cls: "bt-cl-box" + (it.done ? " is-done" : ""), attr: { role: "checkbox", "aria-checked": String(it.done), tabindex: "0" } });
    if (it.done) setIcon(box, "check");
    const toggle = (): void => this.update(this.host.items().map((x, j) => (j === i ? { ...x, done: !x.done } : x)));
    box.onclick = (e) => { e.stopPropagation(); toggle(); };
    box.onkeydown = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } };

    const lbl = row.createDiv({ cls: "bt-st-lbl bt-cl-lbl", text: it.text, attr: { role: "button", tabindex: "0" } });
    lbl.onclick = () => this.startEdit(row, lbl, i);
    lbl.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); this.startEdit(row, lbl, i); } };

    const del = row.createEl("button", { cls: "bt-st-del" });
    tip(del, t("cl_delete_item"));
    setIcon(del, "x");
    del.onclick = (e) => { e.stopPropagation(); this.update(this.host.items().filter((_x, j) => j !== i)); };
  }

  /** Text eines Punkts an Ort und Stelle bearbeiten. Enter/Verlassen übernimmt, Escape verwirft;
   *  ein geleerter Punkt verschwindet (wie in Todoist – kein eigener Lösch-Weg nötig). */
  private startEdit(row: HTMLElement, lbl: HTMLElement, i: number): void {
    // In der Zeile erzeugen (gleiches Fenster/Realm wie die Zeile, auch im Popout) und dann an die
    // Stelle des Labels setzen – replaceWith verschiebt den Knoten.
    const inp = row.createEl("input", { type: "text", cls: "bt-st-input bt-cl-edit" });
    inp.value = this.host.items()[i]?.text ?? "";
    lbl.replaceWith(inp);
    row.addClass("is-editing");
    let fertig = false;
    const commit = (keep: boolean): void => {
      if (fertig) return;
      fertig = true;
      if (!keep) { this.render(); return; }
      const text = inp.value.trim();
      const items = this.host.items();
      this.update(text ? items.map((x, j) => (j === i ? { ...x, text } : x)) : items.filter((_x, j) => j !== i));
    };
    inp.onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(true); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); commit(false); }
    };
    inp.onblur = () => commit(true);
    window.setTimeout(() => { inp.focus(); inp.select(); }, 0);
  }

  /** Neue Reihenfolge aus den Schlüsseln (Indizes) der sichtbaren Zeilen. Ausgeblendete Punkte
   *  stehen nicht im DOM – sie bleiben an ihrer Stelle, die sichtbaren füllen die übrigen Plätze. */
  private reorder(order: number[]): void {
    const items = this.host.items();
    const visible = new Set(order);
    const queue = order.map((k) => items[k]).filter((x): x is ChecklistItem => !!x);
    const out = items.map((it, j) => (visible.has(j) ? queue.shift()! : it));
    this.update(out);
  }

  private renderComposer(body: HTMLElement, draft: string, focus: boolean): void {
    const add = body.createDiv({ cls: "bt-st-add bt-cl-add" });
    setIcon(add.createSpan({ cls: "bt-st-add-ic" }), "plus");
    const inp = add.createEl("input", { type: "text", cls: "bt-st-input", attr: { placeholder: t("cl_add_item") } });
    this.input = inp;
    inp.value = draft;
    inp.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = inp.value;
        inp.value = "";
        this.add(v);
        window.setTimeout(() => this.input?.focus(), 0);
      } else if (e.key === "Escape" && inp.value) { e.preventDefault(); e.stopPropagation(); inp.value = ""; }
    };
    // Mehrzeiliges Einfügen = mehrere Punkte. Ein einzeiliges <input> würde die Zeilenumbrüche
    // sonst stillschweigend entfernen und alles zu EINEM Punkt zusammenziehen.
    inp.onpaste = (e) => {
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!/\r?\n/.test(text.trim())) return;
      e.preventDefault();
      this.add(text);
      window.setTimeout(() => this.input?.focus(), 0);
    };
    if (focus) window.setTimeout(() => inp.focus(), 0);
  }
}

/**
 * Die Checkliste einer Aufgabe als Popover am Badge der Listenzeile/Karte: abhaken, ohne das
 * Modal zu öffnen. Jeder Klick schreibt sofort (plugin.setChecklistItem); das Popover zeichnet
 * seinen eigenen Stand gleich mit, statt auf den Index zu warten.
 */
export function openChecklistPopover(plugin: BeautyTasksPlugin, task: Task, anchor: HTMLElement): void {
  openPopover(anchor, (pop) => {
    pop.addClass("bt-cl-pop");
    const items = task.checklist.map((it) => ({ ...it }));
    const render = (): void => {
      pop.empty();
      const p = checklistProgress(items);
      pop.createDiv({ cls: "bt-pop-head", text: t("checklist") + (p ? " · " + p.done + "/" + p.total : "") });
      items.forEach((it, i) => {
        const row = pop.createDiv({ cls: "bt-row bt-cl-pop-row" + (it.done ? " is-done" : ""), attr: { role: "checkbox", "aria-checked": String(it.done), tabindex: "0" } });
        const box = row.createSpan({ cls: "bt-cl-box" + (it.done ? " is-done" : "") });
        if (it.done) setIcon(box, "check");
        row.createSpan({ cls: "bt-row-lbl", text: it.text });
        const toggle = (): void => {
          it.done = !it.done;
          render();
          void plugin.setChecklistItem(task, i, it.text, it.done);
        };
        row.onclick = (e) => { e.stopPropagation(); toggle(); };
        row.onkeydown = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } };
      });
    };
    render();
  });
}
