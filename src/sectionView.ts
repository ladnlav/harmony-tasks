// Abschnitte auf der Projektseite: der Dialog zum Anlegen/Bearbeiten, das Menü am Abschnittskopf,
// die Auswahl „In Abschnitt verschieben" und das Löschen samt Rückfrage. Gezeichnet werden die
// Abschnitte in heuteView.ts (renderPageBody), gerechnet wird in sections.ts.
import { App, Menu, Modal } from "obsidian";
import type BeautyTasksPlugin from "./main";
import type { Task } from "./types";
import { SectionDef, addSection, findSection, moveSection, orderedSections, renameSection, setSectionDescription } from "./sections";
import { projectSections, setProjectSections, baseName } from "./taskService";
import { ConfirmModal } from "./confirmModal";
import { attachLinkSuggest } from "./linkSuggest";
import { openPopover, popRow } from "./popover";
import { t } from "./i18n";

/** Das Projekt (bzw. der Bereich), dessen Abschnitte eine Seite zeichnet. */
export interface SectionPage { path: string; name: string; defs: SectionDef[]; }

/**
 * Der WIRKSAME Abschnitt einer Aufgabe: der ihrer Hauptaufgabe. Eine Unteraufgabe steht unter
 * ihrer Hauptaufgabe – also auch in deren Abschnitt, gleich was in ihrem eigenen Feld steht.
 * Mit Kreis-Schutz, weil `parent` von Hand geschrieben sein kann.
 */
export function effectiveSection(task: Task, get: (path: string) => Task | undefined): string | null {
  let cur = task;
  const seen = new Set<string>([task.path]);
  while (cur.parent) {
    const p = get(cur.parent);
    if (!p || seen.has(p.path)) break;
    seen.add(p.path);
    cur = p;
  }
  return cur.section ?? null;
}

/** Name + Beschreibung eines Abschnitts – zum Anlegen wie zum Bearbeiten. */
class SectionModal extends Modal {
  private name: string;
  private description: string;

  constructor(app: App, private plugin: BeautyTasksPlugin,
              private o: { title: string; name?: string; description?: string; sourcePath: string },
              private onSave: (name: string, description: string) => void) {
    super(app);
    this.name = o.name ?? "";
    this.description = o.description ?? "";
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("bt-new-modal");
    contentEl.createEl("h3", { text: this.o.title });

    const nameField = contentEl.createDiv({ cls: "bt-new-field" });
    nameField.createEl("label", { text: t("filter_name") });
    const input = nameField.createEl("input", { cls: "bt-new-input", attr: { type: "text", placeholder: t("psec_name_ph") } });
    input.value = this.name;
    input.oninput = () => { this.name = input.value; };
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); this.submit(); } };

    const descField = contentEl.createDiv({ cls: "bt-new-field" });
    descField.createEl("label", { text: t("new_description") });
    const desc = descField.createEl("textarea", { cls: "bt-new-input bt-new-desc", attr: { rows: "4", placeholder: t("psec_desc_ph") } });
    desc.value = this.description;
    desc.oninput = () => { this.description = desc.value; };
    attachLinkSuggest(desc, this.plugin, () => this.o.sourcePath);

    const foot = contentEl.createDiv({ cls: "bt-foot" });
    foot.createDiv();
    const acts = foot.createDiv({ cls: "bt-actions" });
    acts.createEl("button", { text: t("btn_cancel") }).onclick = () => this.close();
    acts.createEl("button", { cls: "mod-cta", text: t("btn_save") }).onclick = () => this.submit();
    window.setTimeout(() => input.focus(), 0);
  }

  onClose(): void { this.contentEl.empty(); }

  private submit(): void {
    if (!this.name.trim()) { return; }
    this.onSave(this.name.trim(), this.description);
    this.close();
  }
}

/** Neuen Abschnitt (oder mit `parent` einen Unterabschnitt) anlegen. */
export function createSection(plugin: BeautyTasksPlugin, path: string, parent: string | null = null): void {
  const p = findSection(projectSections(plugin.app, path), parent);
  const title = p ? t("psec_new_sub_title", p.name) : t("psec_new_title");
  new SectionModal(plugin.app, plugin, { title, sourcePath: path }, (name, description) => {
    // Frisch lesen: Zwischen Öffnen und Speichern kann sich die Notiz geändert haben.
    const { defs } = addSection(projectSections(plugin.app, path), name, parent, description);
    void setProjectSections(plugin.app, path, defs);
  }).open();
}

/** Namen und Beschreibung eines Abschnitts ändern. Aufgaben bleiben, wo sie sind (Kennung). */
export function editSection(plugin: BeautyTasksPlugin, path: string, def: SectionDef): void {
  new SectionModal(plugin.app, plugin, { title: t("psec_edit"), name: def.name, description: def.description, sourcePath: path }, (name, description) => {
    const defs = setSectionDescription(renameSection(projectSections(plugin.app, path), def.id, name), def.id, description);
    void setProjectSections(plugin.app, path, defs);
  }).open();
}

/** Löschen mit Rückfrage – derselbe Aufbau wie beim Löschen eines Projekts: Standard ist
 *  „Aufgaben bleiben" (sie rücken eine Ebene hoch), das Häkchen schickt sie in den Papierkorb. */
export function confirmDeleteSection(plugin: BeautyTasksPlugin, path: string, def: SectionDef): void {
  const ids = [def.id, ...projectSections(plugin.app, path).filter((d) => d.parent === def.id).map((d) => d.id)];
  const count = plugin.sectionTasks(path, ids).length;
  new ConfirmModal(plugin.app, {
    title: t("confirm_delete_title", def.name),
    message: t("psec_delete_body"),
    checkbox: count > 0 ? { label: t("psec_delete_with_tasks", count) } : undefined,
  }, (withTasks) => void plugin.deleteProjectSection(path, def.id, withTasks)).open();
}

/** Menü am Abschnittskopf (⋯ bzw. Rechtsklick). */
export function sectionMenu(plugin: BeautyTasksPlugin, page: SectionPage, def: SectionDef): Menu {
  const m = new Menu();
  m.addItem((i) => i.setTitle(t("btn_add_task")).setIcon("plus")
    .onClick(() => plugin.openNewTask(page.name, undefined, false, undefined, null, null, def.id)));
  if (!def.parent) {
    m.addItem((i) => i.setTitle(t("psec_add_sub")).setIcon("list-plus").onClick(() => createSection(plugin, page.path, def.id)));
  }
  m.addSeparator();
  m.addItem((i) => i.setTitle(t("psec_edit")).setIcon("pencil").onClick(() => editSection(plugin, page.path, def)));
  const sibs = page.defs.filter((d) => d.parent === def.parent);
  const at = sibs.findIndex((d) => d.id === def.id);
  if (at > 0) m.addItem((i) => i.setTitle(t("btn_move_up")).setIcon("chevron-up").onClick(() => void move(plugin, page.path, def.id, -1)));
  if (at >= 0 && at < sibs.length - 1) m.addItem((i) => i.setTitle(t("btn_move_down")).setIcon("chevron-down").onClick(() => void move(plugin, page.path, def.id, 1)));
  m.addSeparator();
  m.addItem((i) => i.setTitle(t("btn_delete")).setIcon("trash-2").setWarning(true).onClick(() => confirmDeleteSection(plugin, page.path, def)));
  return m;
}

async function move(plugin: BeautyTasksPlugin, path: string, id: string, dir: -1 | 1): Promise<void> {
  await setProjectSections(plugin.app, path, moveSection(projectSections(plugin.app, path), id, dir));
}

/**
 * „In Abschnitt verschieben" (Kontextmenü der Zeile): die Abschnitte des Projekts der Aufgabe,
 * Unterabschnitte eingerückt. Nur für Hauptaufgaben – eine Unteraufgabe steht im Abschnitt ihrer
 * Hauptaufgabe (s. effectiveSection).
 */
export function openSectionPicker(plugin: BeautyTasksPlugin, task: Task, anchor: HTMLElement, done: () => void): void {
  const defs = projectSections(plugin.app, task.project);
  const cur = findSection(defs, task.section)?.id ?? null;
  openPopover(anchor, (pop, close) => {
    pop.addClass("bt-picker");
    pop.createDiv({ cls: "bt-pop-head", text: task.project ? baseName(task.project) : "" });
    const pick = (id: string | null): void => { close(); done(); if (id !== cur) void plugin.setTaskSection(task, id); };
    popRow(pop, "minus", t("sec_no_section"), () => pick(null), cur === null);
    for (const e of orderedSections(defs)) {
      popRow(pop, "list", e.def.name, () => pick(e.def.id), cur === e.def.id).addClass(e.depth ? "bt-row-sec2" : "bt-row-sec");
    }
  });
}
