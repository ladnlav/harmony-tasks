// Überblick über EIN Projekt bzw. einen Bereich – der einklappbare Block über den Aufgaben der
// Projektseite: Fortschritt, Zähler (ein Klick filtert die Seite), die nächsten Termine und die
// wichtigen Infos/Links aus der Projektnotiz. Die Zahlen rechnet projectOverview.ts.
//
// Der Block hängt NICHT am Abgleich der Sektionen (tryPatchList zeichnet nur deren Zeilen nach).
// Deshalb liefert er ein eigenes `paint()`, das renderPageBody bei jedem Abgleich mit aufruft –
// sonst stünde nach dem Abhaken einer Aufgabe der alte Fortschritt da.
import { MarkdownRenderer, Notice, TFile, setIcon } from "obsidian";
import { wireLinkClicks } from "./mdLinks";
import type { PageCtx } from "./pageCtx";
import { projectStats, nextTasks, noteInfoBody, frontmatterBlock, COUNTER_RANGE, ProjectStats, NextItem } from "./projectOverview";
import { combineDT, formatDateTime, formatDeadline, dueDist, todayStr } from "./format";
import { attachLinkSuggest } from "./linkSuggest";
import { t } from "./i18n";
import { tip } from "./tooltip";

export interface OverviewMount { paint(): void; }

type Counter = keyof typeof COUNTER_RANGE;
const COUNTERS: { kind: Counter; icon: string; key: string }[] = [
  { kind: "overdue", icon: "alert-triangle", key: "ov_overdue" },
  { kind: "today", icon: "calendar-days", key: "ov_today" },
  { kind: "week", icon: "calendar-1", key: "ov_week" },
  { kind: "noDate", icon: "calendar-off", key: "ov_nodate" },
];

/** @param branch  Pfade, über die gezählt wird – das Projekt und seine Unterprojekte (s. projectBranch).
 *                 Frisch je paint(), weil ein Unterprojekt dazukommen oder gehen kann. */
export function renderOverview(root: HTMLElement, ctx: PageCtx, projectPath: string, name: string,
  branch: () => string[] = () => [projectPath]): OverviewMount {
  const plugin = ctx.plugin;
  const collapseKey = "ov:" + projectPath;   // geräte-lokal, wie die Seitenleisten-Abschnitte
  const box = root.createDiv({ cls: "bt-ov" });

  const head = box.createDiv({ cls: "bt-ov-head", attr: { role: "button", tabindex: "0" } });
  const chev = head.createSpan({ cls: "bt-ov-chev" });
  head.createSpan({ cls: "bt-ov-title", text: t("ov_title") });
  const summary = head.createSpan({ cls: "bt-ov-summary" });   // eingeklappt: „12/18 · 67 %"

  const body = box.createDiv({ cls: "bt-ov-body" });
  const statsEl = body.createDiv({ cls: "bt-ov-stats" });
  const nextEl = body.createDiv({ cls: "bt-ov-next" });
  const infoEl = body.createDiv({ cls: "bt-ov-info" });

  const collapsed = (): boolean => plugin.isNavCollapsed(collapseKey);
  const applyCollapse = (): void => {
    box.toggleClass("is-collapsed", collapsed());
    setIcon(chev, collapsed() ? "chevron-right" : "chevron-down");
    head.setAttr("aria-expanded", String(!collapsed()));
  };
  const toggle = (): void => { void plugin.setNavCollapsed(collapseKey, !collapsed()).then(applyCollapse); };
  head.onclick = toggle;
  head.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
  applyCollapse();

  // ── Zahlen + nächste Termine ──
  const drawStats = (st: ProjectStats): void => {
    statsEl.empty();
    summary.setText(st.total ? t("ov_progress", st.done, st.total, st.progress) : "");
    if (st.total) {
      const bar = statsEl.createDiv({ cls: "bt-ov-progress" });
      const track = bar.createDiv({ cls: "bt-ov-track", attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(st.progress) } });
      track.createDiv({ cls: "bt-ov-fill" }).style.setProperty("--bt-ov-pct", st.progress + "%");
      bar.createSpan({ cls: "bt-ov-progress-txt", text: t("ov_progress", st.done, st.total, st.progress) });
    } else {
      statsEl.createDiv({ cls: "bt-ov-muted", text: t("ov_no_tasks") });
      return;
    }
    const chips = statsEl.createDiv({ cls: "bt-ov-chips" });
    for (const c of COUNTERS) {
      const n = st[c.kind];
      const range = COUNTER_RANGE[c.kind];
      const active = ctx.crit.range === range;
      if (!n && !active) continue;   // leere Zähler sind Rauschen – ausser ihr Filter ist gerade an
      const chip = chips.createSpan({ cls: "bt-ov-chip is-" + c.kind + (active ? " is-active" : ""), attr: { role: "button", tabindex: "0", "aria-pressed": String(active) } });
      setIcon(chip.createSpan({ cls: "bt-ov-chip-ic" }), c.icon);
      chip.createSpan({ cls: "bt-ov-chip-n", text: String(n) });
      chip.createSpan({ cls: "bt-ov-chip-lbl", text: t(c.key) });
      // Der Tooltip nennt den Filter, auf den der Klick schaltet – „heute" filtert z. B. auf
      // „Heute & überfällig", also auf mehr, als die Zahl allein zählt.
      tip(chip, active ? t("filter_clear") : t("ov_filter_tip", t("filter_range_" + range)));
      const go = (): void => ctx.setCriteria({ range: active ? "any" : range });
      chip.onclick = go;
      chip.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    }
  };

  const drawNext = (items: NextItem[], today: string): void => {
    nextEl.empty();
    if (!items.length) return;
    nextEl.createDiv({ cls: "bt-ov-sub", text: t("ov_next") });
    const list = nextEl.createDiv({ cls: "bt-ov-next-list" });
    for (const it of items) {
      // data-path: Rechtsklick öffnet dasselbe Aufgabenmenü wie in der Liste (Delegation am Tab).
      const row = list.createDiv({ cls: "bt-ov-next-row" + (it.overdue ? " is-overdue" : ""), attr: { role: "button", tabindex: "0", "data-path": it.task.path } });
      const when = combineDT(it.date, it.time);
      const date = row.createSpan({ cls: "bt-ov-next-date" + (it.deadline ? " is-deadline" : ""), text: it.deadline ? formatDeadline(when, today) : formatDateTime(when, today) });
      const dist = it.overdue ? "overdue" : dueDist(it.date, today);
      if (dist) date.dataset.dist = dist;
      if (it.deadline) tip(date, t("chip_deadline"));
      row.createSpan({ cls: "bt-ov-next-title", text: it.task.title });
      const open = (): void => plugin.openEditTask(it.task);
      row.onclick = open;
      row.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    }
  };

  // ── Infos & Links: der Body der Projektnotiz ──
  // Die Projektnotiz IST laut README der Ort für Brief, Links und Notizen zum Projekt. Hier wird
  // sie gezeigt – und auf Wunsch an Ort und Stelle bearbeitet. Geschrieben wird NUR beim
  // ausdrücklichen Speichern, und nur, wenn die Notiz sich seit dem Öffnen nicht geändert hat.
  let infoMtime = -1;
  let editing = false;
  let showAll = false;

  const openNote = (f: TFile): void => { void plugin.app.workspace.getLeaf("tab").openFile(f); };

  const drawInfo = (f: TFile, md: string): void => {
    infoEl.empty();
    const ihead = infoEl.createDiv({ cls: "bt-ov-info-head" });
    ihead.createSpan({ cls: "bt-ov-sub", text: t("ov_info") });
    const acts = ihead.createDiv({ cls: "bt-ov-info-acts" });
    const edit = acts.createEl("button", { cls: "bt-ov-icbtn" });
    tip(edit, t("ov_info_edit"));
    setIcon(edit, "pencil");
    edit.onclick = (e) => { e.stopPropagation(); void startEdit(f); };
    const open = acts.createEl("button", { cls: "bt-ov-icbtn" });
    tip(open, t("ov_open_note"));
    setIcon(open, "file-text");
    open.onclick = (e) => { e.stopPropagation(); openNote(f); };

    if (!md) {
      const ph = infoEl.createDiv({ cls: "bt-ov-info-empty", text: t("ov_info_empty"), attr: { role: "button", tabindex: "0" } });
      ph.onclick = () => void startEdit(f);
      ph.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void startEdit(f); } };
      return;
    }
    const mdEl = infoEl.createDiv({ cls: "bt-ov-info-md markdown-rendered" + (showAll ? "" : " is-clamped") });
    const more = infoEl.createDiv({ cls: "bt-ov-more bt-hidden", attr: { role: "button", tabindex: "0" } });
    const syncMore = (): void => {
      // Nur anbieten, wenn wirklich etwas abgeschnitten ist.
      const clipped = !showAll && mdEl.scrollHeight > mdEl.clientHeight + 2;
      more.toggleClass("bt-hidden", !clipped && !showAll);
      more.setText(showAll ? t("ov_less") : t("ov_more"));
    };
    more.onclick = () => { showAll = !showAll; mdEl.toggleClass("is-clamped", !showAll); syncMore(); };
    wireLinkClicks(mdEl, plugin.app, f.path);
    if (ctx.titleComp) {
      void MarkdownRenderer.render(plugin.app, md, mdEl, f.path, ctx.titleComp).then(() => window.setTimeout(syncMore, 0));
    } else {
      mdEl.setText(md);
      window.setTimeout(syncMore, 0);
    }
  };

  const refreshInfo = async (): Promise<void> => {
    if (editing) return;
    const f = plugin.app.vault.getAbstractFileByPath(projectPath);
    if (!(f instanceof TFile)) { infoEl.empty(); return; }
    if (f.stat.mtime === infoMtime) return;   // unverändert -> nichts neu zeichnen
    infoMtime = f.stat.mtime;
    const content = await plugin.app.vault.cachedRead(f);
    if (editing || !infoEl.isConnected) return;
    drawInfo(f, noteInfoBody(content, name));
  };

  const startEdit = async (f: TFile): Promise<void> => {
    if (editing) return;
    editing = true;
    const content = await plugin.app.vault.read(f);
    const fm = frontmatterBlock(content);
    const startBody = content.slice(fm.length);
    infoEl.empty();
    infoEl.addClass("is-editing");
    const ta = infoEl.createEl("textarea", { cls: "bt-ov-info-ta", attr: { rows: "6", placeholder: t("ov_info_ph") } });
    ta.value = startBody.replace(/^\s*\n/, "");
    attachLinkSuggest(ta, plugin, () => f.path);
    const acts = infoEl.createDiv({ cls: "bt-ov-info-edit-acts" });
    const done = (): void => { editing = false; infoEl.removeClass("is-editing"); infoMtime = -1; void refreshInfo(); };
    const cancel = acts.createEl("button", { text: t("btn_cancel") });
    cancel.onclick = done;
    const save = acts.createEl("button", { cls: "mod-cta", text: t("btn_save") });
    const doSave = async (): Promise<void> => {
      let konflikt = false;
      const text = ta.value.replace(/\s+$/, "");
      await plugin.app.vault.process(f, (data) => {
        const fm2 = frontmatterBlock(data);
        if (data.slice(fm2.length) !== startBody) { konflikt = true; return data; }
        return fm2 + (fm2 && !fm2.endsWith("\n") ? "\n" : "") + (text ? "\n" + text + "\n" : "");
      });
      if (konflikt) { new Notice(t("ov_info_conflict")); return; }
      done();
    };
    save.onclick = () => void doSave();
    ta.onkeydown = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void doSave(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(); }
    };
    window.setTimeout(() => ta.focus(), 0);
  };

  // Nur neu zeichnen, was sich geändert hat: Der Abgleich ruft paint() bei JEDER Index-Meldung.
  let lastSig = "";
  const paint = (): void => {
    if (!box.isConnected) return;
    const today = todayStr();
    const tasks = branch().flatMap((p) => plugin.index.allInProject(p));
    const st = projectStats(tasks, today);
    const nx = nextTasks(tasks, today, 5);
    const sig = [JSON.stringify(st), ctx.crit.range, today,
      ...nx.map((n) => [n.task.path, n.task.title, n.date, n.time ?? "", n.deadline, n.overdue].join("~"))].join("|");
    if (sig !== lastSig) {
      lastSig = sig;
      drawStats(st);
      drawNext(nx, today);
    }
    void refreshInfo();
  };
  paint();
  return { paint };
}
