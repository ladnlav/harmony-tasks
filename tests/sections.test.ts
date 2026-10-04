import { describe, it, expect } from "vitest";
import {
  readSections, writeSections, orderedSections, sectionLabel, addSection, renameSection, setSectionDescription,
  moveSection, removeSection, mergeSections, groupBySection, newSectionId, SectionDef,
} from "../src/sections";

const def = (id: string, name: string, parent: string | null = null, description = ""): SectionDef => ({ id, name, parent, description });

// Projekt „Website": Design (mit Wireframes, UI-Kit) und Entwicklung.
const BASIS: SectionDef[] = [
  def("s-d", "Design"), def("s-w", "Wireframes", "s-d"), def("s-u", "UI-Kit", "s-d"), def("s-e", "Entwicklung"),
];

describe("readSections – Frontmatter lesen und bereinigen", () => {
  it("liest die gespeicherte Form", () => {
    expect(readSections([{ id: "s-d", name: "Design", description: "Entwürfe" }, { id: "s-w", name: "Wireframes", parent: "s-d" }]))
      .toEqual([def("s-d", "Design", null, "Entwürfe"), def("s-w", "Wireframes", "s-d")]);
  });

  it("verwirft Einträge ohne Kennung und Doppelte", () => {
    expect(readSections([{ name: "ohne" }, { id: "a", name: "A" }, { id: "a", name: "B" }, "Unsinn", null]).map((d) => d.name)).toEqual(["A"]);
  });

  it("Name fehlt -> Kennung als Name (lieber sichtbar als verschwunden)", () => {
    expect(readSections([{ id: "s-x" }])[0].name).toBe("s-x");
  });

  it("unbekannte Eltern, Selbstbezug und dritte Ebene werden zur obersten Ebene", () => {
    const r = readSections([
      { id: "a", name: "A" }, { id: "b", name: "B", parent: "a" }, { id: "c", name: "C", parent: "b" },
      { id: "d", name: "D", parent: "gibt-es-nicht" }, { id: "e", name: "E", parent: "e" },
    ]);
    expect(r.find((x) => x.id === "b")?.parent).toBe("a");
    expect(r.find((x) => x.id === "c")?.parent).toBeNull();   // Unterabschnitt eines Unterabschnitts
    expect(r.find((x) => x.id === "d")?.parent).toBeNull();
    expect(r.find((x) => x.id === "e")?.parent).toBeNull();
  });

  it("kein Array = keine Abschnitte", () => {
    expect(readSections(undefined)).toEqual([]);
    expect(readSections("Design")).toEqual([]);
  });

  it("normalisiert die Reihenfolge: Unterabschnitte direkt nach ihrem Abschnitt", () => {
    const r = readSections([{ id: "w", name: "W", parent: "d" }, { id: "e", name: "E" }, { id: "d", name: "D" }]);
    expect(r.map((x) => x.id)).toEqual(["e", "d", "w"]);
  });

  it("Rundreise lesen -> schreiben -> lesen", () => {
    expect(readSections(writeSections(BASIS))).toEqual(BASIS);
  });

  it("schreibt leere Felder nicht", () => {
    expect(writeSections([def("a", "A")])).toEqual([{ id: "a", name: "A" }]);
  });
});

describe("Anzeige", () => {
  it("orderedSections liefert Tiefe 0/1", () => {
    expect(orderedSections(BASIS).map((e) => e.def.id + ":" + e.depth)).toEqual(["s-d:0", "s-w:1", "s-u:1", "s-e:0"]);
  });

  it("sectionLabel nennt den Elter mit", () => {
    expect(sectionLabel(BASIS, "s-w")).toBe("Design › Wireframes");
    expect(sectionLabel(BASIS, "s-e")).toBe("Entwicklung");
    expect(sectionLabel(BASIS, "weg")).toBeNull();
    expect(sectionLabel(BASIS, null)).toBeNull();
  });
});

describe("Bearbeiten", () => {
  it("newSectionId ist im Projekt eindeutig", () => {
    const zufall = ["s-d".slice(2), "neu"];
    expect(newSectionId(BASIS, () => zufall.shift()!)).toBe("s-neu");
  });

  it("addSection: oben ans Ende, als Unterabschnitt ans Ende seiner Geschwister", () => {
    const a = addSection(BASIS, "Tests", null, "", () => "t");
    expect(a.id).toBe("s-t");
    expect(a.defs.map((d) => d.id)).toEqual(["s-d", "s-w", "s-u", "s-e", "s-t"]);
    const b = addSection(BASIS, "Icons", "s-d", "", () => "i");
    expect(b.defs.map((d) => d.id)).toEqual(["s-d", "s-w", "s-u", "s-i", "s-e"]);
  });

  it("addSection unter einem Unterabschnitt wird dessen Geschwister (zwei Ebenen)", () => {
    expect(addSection(BASIS, "Tief", "s-w", "", () => "x").defs.find((d) => d.id === "s-x")?.parent).toBe("s-d");
  });

  it("umbenennen und beschreiben ändern nur diesen Abschnitt; leerer Name bleibt beim alten", () => {
    expect(renameSection(BASIS, "s-e", "Code").find((d) => d.id === "s-e")?.name).toBe("Code");
    expect(renameSection(BASIS, "s-e", "  ").find((d) => d.id === "s-e")?.name).toBe("Entwicklung");
    expect(setSectionDescription(BASIS, "s-d", "Alles Visuelle\n").find((d) => d.id === "s-d")?.description).toBe("Alles Visuelle");
  });

  it("moveSection tauscht mit dem Geschwister – Unterabschnitte wandern mit", () => {
    expect(moveSection(BASIS, "s-e", -1).map((d) => d.id)).toEqual(["s-e", "s-d", "s-w", "s-u"]);
    expect(moveSection(BASIS, "s-u", -1).map((d) => d.id)).toEqual(["s-d", "s-u", "s-w", "s-e"]);
    expect(moveSection(BASIS, "s-d", -1).map((d) => d.id)).toEqual(["s-d", "s-w", "s-u", "s-e"]);   // schon oben
  });

  it("removeSection nimmt die Unterabschnitte mit und sagt, wohin die Aufgaben gehen", () => {
    const r = removeSection(BASIS, "s-d");
    expect(r.defs.map((d) => d.id)).toEqual(["s-e"]);
    expect([...r.reassign.entries()]).toEqual([["s-d", null], ["s-w", null], ["s-u", null]]);
    const s = removeSection(BASIS, "s-w");
    expect(s.defs.map((d) => d.id)).toEqual(["s-d", "s-u", "s-e"]);
    expect(s.reassign.get("s-w")).toBe("s-d");   // Unterabschnitt -> Aufgaben in den Elter
  });

  it("mergeSections ergänzt Unbekanntes, Bekanntes bleibt wie im Projekt", () => {
    const m = mergeSections([def("s-d", "Mein Design")], [def("s-d", "Design"), def("s-w", "Wireframes", "s-d")]);
    expect(m).toEqual([def("s-d", "Mein Design"), def("s-w", "Wireframes", "s-d")]);
  });
});

describe("groupBySection – Aufgaben ordnen", () => {
  type T = { id: string; s: string | null };
  const tasks: T[] = [{ id: "1", s: "s-w" }, { id: "2", s: null }, { id: "3", s: "s-e" }, { id: "4", s: "weg" }, { id: "5", s: "s-w" }];

  it("Ohne Abschnitt vorn (auch unbekannte Kennungen), dann alle Abschnitte – leere eingeschlossen", () => {
    const g = groupBySection(tasks, BASIS, (x) => x.s);
    expect(g.map((x) => x.key + "=" + x.tasks.map((y) => y.id).join(","))).toEqual([
      "=2,4", "s-d=", "s-w=1,5", "s-u=", "s-e=3",
    ]);
    expect(g[2].depth).toBe(1);
  });

  it("ohne lose Aufgaben fehlt die Gruppe „Ohne Abschnitt“", () => {
    expect(groupBySection([{ id: "1", s: "s-e" }], BASIS, (x) => x.s)[0].key).toBe("s-d");
  });
});
