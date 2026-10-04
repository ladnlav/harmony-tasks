// Unterprojekte auf der Seite eines Projekts bzw. Bereichs (s. projectTree.ts): je Unterprojekt eine
// Zeile mit Fortschritt und Zählern, ein Klick öffnet es. Darunter folgen die EIGENEN Aufgaben der
// Seite – die der Unterprojekte stehen auf deren Seiten; der Überblick darüber zählt den ganzen Zweig.
//
// Wie der Überblick hängt der Block nicht am Abgleich der Sektionen (tryPatchList zeichnet nur deren
// Zeilen). renderPageBody ruft deshalb sein `paint()` bei jedem Abgleich mit – sonst stünde nach dem
// Abhaken in einem Unterprojekt der alte Fortschritt da. Welche Unterprojekte es gibt, steckt in der
// Kopf-Signatur der Seite (noteHeadSig): Ändert sich die Liste, wird die Seite neu gebaut.
import { Menu, setIcon } from "obsidian";
import type { PageCtx } from "./pageCtx";
import type { ProjItem } from "./taskService";
import { projectStats, ProjectStats } from "./projectOverview";
import { todayStr } from "./format";
import { buildItemMenu } from "./navMenu";
import { NewItemModal } from "./newItemModal";
import { t } from "./i18n";
import { tip } from "./tooltip";

export interface SubprojectMount { paint(): void; }

interface RowEls { fill: HTMLElement; txt: HTMLElement; chips: HTMLElement; track: HTMLElement }

/** @param wireDrop  Macht eine Zeile zur Ablage für gezogene Aufgaben (kommt aus heuteView). */
export function renderSubprojects(root: HTMLElement, ctx: PageCtx, parent: ProjItem, kids: readonly ProjItem[],
  wireDrop?: (el: HTMLElement, kid: ProjItem) => void): SubprojectMount {
  const plugin = ctx.plugin;
  const collapseKey = "subs:" + parent.path;   // geräte-lokal, wie Überblick und Seitenleiste
  const box = root.createDiv({ cls: "bt-subp" });

  const head = box.createDiv({ cls: "bt-subp-head" });
  const toggle = head.createDiv({ cls: "bt-subp-toggle", attr: { role: "button", tabindex: "0" } });
  const chev = toggle.createSpan({ cls: "bt-subp-chev" });
  toggle.createSpan({ cls: "bt-subp-title", text: t(parent.type === "area" ? "subp_title_area" : "subp_title") });
  toggle.createSpan({ cls: "bt-subp-n", text: String(kids.length) });
  const add = head.createEl("button", { cls: "bt-ov-icbtn bt-subp-add" });
  setIcon(add, "plus");
  tip(add, t("subp_add"));
  add.onclick = (e) => { e.stopPropagation(); new NewItemModal(plugin, "project", undefined, "name", { parent: parent.path }).open(); };

  const list = box.createDiv({ cls: "bt-subp-list" });
  const rows = new Map<string, RowEls>();
  for (const k of kids) {
    const row = list.createDiv({ cls: "bt-subp-row", attr: { role: "button", tabindex: "0", "data-project": k.path } });
    const ic = row.createSpan({ cls: "bt-subp-ic" });
    setIcon(ic, k.icon);
    if (k.color) ic.setCssStyles({ color: k.color });
    row.createSpan({ cls: "bt-subp-name", text: k.name });
    const chips = row.createSpan({ cls: "bt-subp-chips" });
    const prog = row.createSpan({ cls: "bt-subp-prog" });
    const track = prog.createSpan({ cls: "bt-subp-track", attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" } });
    const fill = track.createSpan({ cls: "bt-subp-fill" });
    const txt = prog.createSpan({ cls: "bt-subp-txt" });
    const open = (): void => ctx.open({ kind: "project", key: k.path });
    row.onclick = open;
    row.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    // Rechtsklick = dasselbe Menü wie in der Seitenleiste (Umbenennen, Verschieben, Archivieren …).
    row.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const m = new Menu();
      buildItemMenu(m, plugin, { sec: "projects", key: k.path, name: k.name, hidden: k.hidden, color: k.color, type: k.type }, "manage");
      m.showAtMouseEvent(e);
    };
    wireDrop?.(row, k);
    rows.set(k.path, { fill, txt, chips, track });
  }

  const collapsed = (): boolean => plugin.isNavCollapsed(collapseKey);
  const applyCollapse = (): void => {
    box.toggleClass("is-collapsed", collapsed());
    setIcon(chev, collapsed() ? "chevron-right" : "chevron-down");
    toggle.setAttr("aria-expanded", String(!collapsed()));
  };
  const flip = (): void => { void plugin.setNavCollapsed(collapseKey, !collapsed()).then(applyCollapse); };
  toggle.onclick = flip;
  toggle.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
  applyCollapse();

  const chip = (host: HTMLElement, cls: string, icon: string, n: number, label: string): void => {
    const c = host.createSpan({ cls: "bt-subp-chip " + cls });
    setIcon(c.createSpan({ cls: "bt-subp-chip-ic" }), icon);
    c.createSpan({ text: String(n) });
    tip(c, n + " " + label);
  };
  const draw = (k: ProjItem, st: ProjectStats): void => {
    const r = rows.get(k.path);
    if (!r) return;
    r.fill.style.setProperty("--bt-subp-pct", st.progress + "%");
    r.track.setAttr("aria-valuenow", String(st.progress));
    r.track.toggleClass("is-empty", !st.total);
    r.txt.setText(st.total ? t("subp_progress", st.done, st.total) : t("subp_no_tasks"));
    r.chips.empty();
    if (st.overdue) chip(r.chips, "is-overdue", "alert-triangle", st.overdue, t("ov_overdue"));
    if (st.today) chip(r.chips, "is-today", "calendar-days", st.today, t("ov_today"));
  };

  // Nur neu zeichnen, was sich geändert hat: paint() läuft bei JEDER Index-Meldung.
  let lastSig = "";
  const paint = (): void => {
    if (!box.isConnected) return;
    const today = todayStr();
    const stats = kids.map((k) => projectStats(plugin.index.allInProject(k.path), today));
    const sig = today + JSON.stringify(stats);
    if (sig === lastSig) return;
    lastSig = sig;
    kids.forEach((k, i) => draw(k, stats[i]));
  };
  paint();
  return { paint };
}
