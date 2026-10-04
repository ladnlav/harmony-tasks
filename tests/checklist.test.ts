import { describe, it, expect } from "vitest";
import {
  parseChecklist, parseChecklistItem, serializeChecklist, resetChecklist, checklistProgress,
  itemsFromText, setItemDone, sameChecklist,
} from "../src/checklist";

describe("Checkliste – Lesen", () => {
  it("liest die gespeicherte Form", () => {
    expect(parseChecklist(["[ ] Milch", "[x] Eier", "[X] Brot"])).toEqual([
      { text: "Milch", done: false }, { text: "Eier", done: true }, { text: "Brot", done: true },
    ]);
  });

  it("fehlendes oder leeres Feld = leere Checkliste", () => {
    expect(parseChecklist(undefined)).toEqual([]);
    expect(parseChecklist(null)).toEqual([]);
    expect(parseChecklist("")).toEqual([]);
    expect(parseChecklist([])).toEqual([]);
  });

  it("ist nachsichtig mit Handgeschriebenem", () => {
    expect(parseChecklistItem("- [x] Markdown-Zeile")).toEqual({ text: "Markdown-Zeile", done: true });
    expect(parseChecklistItem("ohne Kästchen")).toEqual({ text: "ohne Kästchen", done: false });
    expect(parseChecklistItem("- nur Aufzählung")).toEqual({ text: "nur Aufzählung", done: false });
    expect(parseChecklistItem({ text: "Objekt", done: true })).toEqual({ text: "Objekt", done: true });
    expect(parseChecklistItem(42)).toEqual({ text: "42", done: false });
  });

  it("verwirft leere Punkte und Unbrauchbares", () => {
    expect(parseChecklist(["[ ] ", "", "   ", null, { text: "" }, "[x] ok"])).toEqual([{ text: "ok", done: true }]);
  });

  it("ein einzelner String wird zeilenweise gelesen", () => {
    expect(parseChecklist("[ ] a\n[x] b")).toEqual([{ text: "a", done: false }, { text: "b", done: true }]);
  });
});

describe("Checkliste – Schreiben", () => {
  it("Rundreise: lesen -> schreiben -> lesen ist verlustfrei", () => {
    const raw = ["[ ] Eingang leeren", "[x] Kalender prüfen", "[ ] Ziele: [Woche] planen"];
    expect(serializeChecklist(parseChecklist(raw))).toEqual(raw);
  });

  it("leere Punkte fallen beim Schreiben weg", () => {
    expect(serializeChecklist([{ text: "  ", done: true }, { text: "a", done: false }])).toEqual(["[ ] a"]);
    expect(serializeChecklist(undefined)).toEqual([]);
  });
});

describe("Checkliste – Hilfen", () => {
  it("resetChecklist öffnet alle Punkte und lässt das Original unberührt", () => {
    const orig = [{ text: "a", done: true }, { text: "b", done: false }];
    expect(resetChecklist(orig)).toEqual([{ text: "a", done: false }, { text: "b", done: false }]);
    expect(orig[0].done).toBe(true);
    expect(resetChecklist(undefined)).toEqual([]);
  });

  it("Fortschritt", () => {
    expect(checklistProgress([{ text: "a", done: true }, { text: "b", done: false }])).toEqual({ done: 1, total: 2 });
    expect(checklistProgress([])).toBeNull();
    expect(checklistProgress(undefined)).toBeNull();
  });

  it("mehrzeiliges Einfügen ergibt mehrere Punkte, Markdown-Zustand bleibt", () => {
    expect(itemsFromText("Milch\r\n- [x] Eier\n\n  Brot  ")).toEqual([
      { text: "Milch", done: false }, { text: "Eier", done: true }, { text: "Brot", done: false },
    ]);
  });

  it("setItemDone trifft den Punkt an seinem Index", () => {
    const items = [{ text: "a", done: false }, { text: "b", done: false }];
    expect(setItemDone(items, 1, "b", true)).toEqual([{ text: "a", done: false }, { text: "b", done: true }]);
    expect(items[1].done).toBe(false);   // rein: Eingabe bleibt unverändert
  });

  it("setItemDone sucht nach dem Text, wenn sich die Liste verschoben hat", () => {
    const items = [{ text: "neu", done: false }, { text: "a", done: false }, { text: "b", done: false }];
    expect(setItemDone(items, 1, "b", true)?.[2]).toEqual({ text: "b", done: true });
  });

  it("setItemDone ändert nichts, wenn der Punkt verschwunden ist", () => {
    expect(setItemDone([{ text: "a", done: false }], 0, "weg", true)).toBeNull();
  });

  it("sameChecklist vergleicht den Inhalt", () => {
    expect(sameChecklist([{ text: "a", done: true }], [{ text: "a", done: true }])).toBe(true);
    expect(sameChecklist([{ text: "a", done: true }], [{ text: "a", done: false }])).toBe(false);
    expect(sameChecklist(undefined, [])).toBe(true);
  });
});
