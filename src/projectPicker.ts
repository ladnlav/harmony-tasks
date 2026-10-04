// Projekt-Auswahl in Popovern (Editor, Schnellerfassung, „Verschieben", Vorlagen): Bereiche und
// Projekte als Baum – Unterprojekte eingerückt unter ihrem Elter (s. projectTree.ts). Vorher baute
// jeder Picker seine zwei Gruppen selbst; mit Unterprojekten wäre die Einrückung viermal dieselbe
// Logik geworden.
import type { App } from "obsidian";
import { listProjectsAndAreas, nestProjects, ProjItem } from "./taskService";
import { t } from "./i18n";

/** Gruppe „Bereiche" (jeder Bereich mit seinen Unterprojekten), dann „Projekte" (oberste mit
 *  ihren). `row` zeichnet EINE Zeile und gibt sie zurück; die Einrückung macht dieser Helfer. */
export function projectPickerGroups(pop: HTMLElement, app: App, row: (it: ProjItem, depth: 0 | 1) => HTMLElement): void {
  const { areas, projects } = nestProjects(listProjectsAndAreas(app));
  const group = (title: string, items: { item: ProjItem; depth: 0 | 1 }[]): void => {
    if (!items.length) return;
    pop.createDiv({ cls: "bt-pop-head", text: title });
    for (const e of items) {
      const el = row(e.item, e.depth);
      if (e.depth) el.addClass("bt-row-sub");
    }
  };
  group(t("group_area"), areas);
  group(t("group_project"), projects);
}
