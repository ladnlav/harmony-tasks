import { describe, it, expect } from "vitest";
import { parentKeyOf, linkTree, childrenOf, branchPaths, flattenTree, canAdopt, parentCandidates, TreeNode } from "../src/projectTree";

const node = (name: string, type: "project" | "area" = "project", parent: string | null = null, archived = false): TreeNode =>
  ({ name, path: "P/" + name + ".md", type, archived, parentKey: parent ? parent.toLowerCase() : null });

/** linkTree auf die Einträge anwenden – so, wie es projScan tut. */
const linked = (items: TreeNode[]) => {
  const m = linkTree(items);
  return items.map((x) => ({ ...x, ...m.get(x.path)! }));
};
const parentOf = (items: TreeNode[], name: string): string | null =>
  linked(items).find((x) => x.name === name)!.parent;

describe("parentKeyOf – Verweis lesen", () => {
  it("Wikilink, Ordner, Alias, Klartext, Liste", () => {
    expect(parentKeyOf("[[Haus]]")).toBe("haus");
    expect(parentKeyOf("[[Projekte/Haus|Mein Haus]]")).toBe("haus");
    expect(parentKeyOf("Haus")).toBe("haus");
    expect(parentKeyOf(["[[Garten]]"])).toBe("garten");
  });
  it("Leeres und Fremdes -> null", () => {
    expect(parentKeyOf("")).toBeNull();
    expect(parentKeyOf("[[ ]]")).toBeNull();
    expect(parentKeyOf(42)).toBeNull();
    expect(parentKeyOf(undefined)).toBeNull();
  });
});

describe("linkTree – zwei Ebenen", () => {
  it("Projekt unter Projekt und unter Bereich", () => {
    const items = [node("Haus"), node("Küche", "project", "Haus"), node("Familie", "area"), node("Urlaub", "project", "familie")];
    expect(parentOf(items, "Küche")).toBe("P/Haus.md");
    expect(parentOf(items, "Urlaub")).toBe("P/Familie.md");
    expect(parentOf(items, "Haus")).toBeNull();
  });

  it("Bereiche werden nie Kind", () => {
    expect(parentOf([node("Haus"), node("Familie", "area", "Haus")], "Familie")).toBeNull();
  });

  it("unbekannter Elter und Selbstbezug -> oben", () => {
    expect(parentOf([node("Küche", "project", "Gibtsnicht")], "Küche")).toBeNull();
    expect(parentOf([node("Küche", "project", "Küche")], "Küche")).toBeNull();
  });

  it("dritte Ebene: das Enkel bleibt oben, das Kind hängt", () => {
    const items = [node("Haus"), node("Küche", "project", "Haus"), node("Herd", "project", "Küche")];
    expect(parentOf(items, "Küche")).toBe("P/Haus.md");
    expect(parentOf(items, "Herd")).toBeNull();
  });

  it("Ring: beide oben", () => {
    const items = [node("A", "project", "B"), node("B", "project", "A")];
    expect(parentOf(items, "A")).toBeNull();
    expect(parentOf(items, "B")).toBeNull();
  });

  it("archivierter Elter archiviert den Zweig mit", () => {
    const l = linked([node("Haus", "project", null, true), node("Küche", "project", "Haus"), node("Bad")]);
    expect(l.map((x) => x.name + ":" + x.inArchive)).toEqual(["Haus:true", "Küche:true", "Bad:false"]);
  });

  it("Gross-/Kleinschreibung des Verweises egal", () => {
    expect(parentOf([node("Haus"), node("Küche", "project", "HAUS")], "Küche")).toBe("P/Haus.md");
  });
});

describe("Abfragen", () => {
  const items = linked([node("Haus"), node("Küche", "project", "Haus"), node("Bad", "project", "Haus"), node("Familie", "area"), node("Urlaub", "project", "Familie"), node("Solo")]);
  const byName = (n: string) => items.find((x) => x.name === n)!;

  it("childrenOf und branchPaths", () => {
    expect(childrenOf(items, "P/Haus.md").map((x) => x.name)).toEqual(["Küche", "Bad"]);
    expect(branchPaths(items, "P/Haus.md")).toEqual(["P/Haus.md", "P/Küche.md", "P/Bad.md"]);
    expect(branchPaths(items, "P/Solo.md")).toEqual(["P/Solo.md"]);
  });

  it("flattenTree: oben, dann die Kinder", () => {
    const tops = items.filter((x) => x.parent === null);
    expect(flattenTree(tops, (t) => childrenOf(items, t.path)).map((e) => e.item.name + ":" + e.depth))
      .toEqual(["Haus:0", "Küche:1", "Bad:1", "Familie:0", "Urlaub:1", "Solo:0"]);
  });

  it("canAdopt: nur Projekte ohne Kinder, nur unter oberste Einträge", () => {
    expect(canAdopt(items, byName("Familie"), byName("Solo"))).toBe(true);
    expect(canAdopt(items, byName("Solo"), byName("Küche"))).toBe(true);      // umhängen
    expect(canAdopt(items, byName("Küche"), byName("Solo"))).toBe(false);     // Küche ist selbst Kind
    expect(canAdopt(items, byName("Solo"), byName("Haus"))).toBe(false);      // Haus hat Kinder
    expect(canAdopt(items, byName("Haus"), byName("Familie"))).toBe(false);   // Bereich wird nie Kind
    expect(canAdopt(items, byName("Solo"), byName("Solo"))).toBe(false);
  });

  it("parentCandidates für ein Kind: alle obersten ausser sich selbst", () => {
    expect(parentCandidates(items, byName("Küche")).map((x) => x.name)).toEqual(["Haus", "Familie", "Solo"]);
  });
});
