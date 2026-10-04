import { Modal, setIcon } from "obsidian";
import type BeautyTasksPlugin from "./main";
import { t } from "./i18n";

interface Highlight { icon: string; title: string; desc: string; }

/** „Neu in dieser Version"-Modal – einmalig nach einem Versionswechsel gezeigt (siehe main.ts).
 *  Die Highlights beziehen sich auf die aktuell veröffentlichte Version. */
export class WhatsNewModal extends Modal {
  constructor(private plugin: BeautyTasksPlugin) { super(plugin.app); }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("bt-whatsnew");
    contentEl.createDiv({ cls: "bt-wn-eyebrow", text: this.plugin.manifest.name + " " + this.plugin.manifest.version });
    contentEl.createEl("h2", { cls: "bt-wn-title", text: t("whatsnew_title") });

    // Harmony Tasks: was der Fork gegenüber BeautyTasks 1.46 mitbringt, das Neueste zuerst. Wer
    // von BeautyTasks umzieht und seine data.json mitnimmt, sieht den Dialog einmal (1.46 -> 1.x ist
    // ein Minor-Wechsel) – dann gehört alles dazu; wer von 1.0 kommt, liest oben, was neu ist.
    const items: Highlight[] = [
      { icon: "folder-tree", title: t("wn_ht_subp_t"), desc: t("wn_ht_subp_d") },
      { icon: "list-checks", title: t("wn_ht_checklist_t"), desc: t("wn_ht_checklist_d") },
      { icon: "layout-list", title: t("wn_ht_sections_t"), desc: t("wn_ht_sections_d") },
      { icon: "gauge", title: t("wn_ht_overview_t"), desc: t("wn_ht_overview_d") },
      { icon: "repeat", title: t("wn_ht_recur_t"), desc: t("wn_ht_recur_d") },
    ];
    const list = contentEl.createDiv({ cls: "bt-wn-list" });
    for (const it of items) {
      const row = list.createDiv({ cls: "bt-wn-item" });
      setIcon(row.createDiv({ cls: "bt-wn-ic" }), it.icon);
      const body = row.createDiv({ cls: "bt-wn-body" });
      body.createDiv({ cls: "bt-wn-item-t", text: it.title });
      body.createDiv({ cls: "bt-wn-item-d", text: it.desc });
    }

    const foot = contentEl.createDiv({ cls: "bt-wn-foot" });
    foot.createEl("button", { cls: "mod-cta", text: t("whatsnew_ok") }).onclick = () => this.close();
  }

  onClose(): void { this.contentEl.empty(); }
}
