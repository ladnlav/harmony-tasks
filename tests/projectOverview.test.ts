import { describe, it, expect, beforeAll } from "vitest";
import { Task } from "../src/types";
import { projectStats, nextTasks, noteInfoBody, frontmatterBlock, COUNTER_RANGE } from "../src/projectOverview";
import { filterTasks, DEFAULT_CRITERIA } from "../src/filterEngine";
import { initStatuses } from "../src/statuses";

beforeAll(() => initStatuses());

const HEUTE = "2026-10-04";

function mk(id: string, over: Partial<Task> = {}): Task {
  return {
    id, path: "Items/" + id + ".md", title: id, titleInFm: true, status: "todo", priority: "normal",
    due: null, dueTime: null, scheduled: null, scheduledTime: null, duration: null, start: null,
    sortOrder: null, project: "Projects/Site.md", parent: null, labels: [], description: "", recurrence: null,
    recurBasis: "due", reminders: [], created: "2026-07-01", completed: null, cancelled: null,
    externalId: null, checklist: [], ...over,
  };
}

const AUFGABEN: Task[] = [
  mk("ueberfaellig", { due: "2026-10-01" }),
  mk("heute", { due: HEUTE, dueTime: "09:00" }),
  mk("morgen", { due: "2026-10-05" }),
  mk("in7", { due: "2026-10-11" }),
  mk("in8", { due: "2026-10-12" }),
  mk("ohne"),
  mk("erledigt", { status: "done", due: "2026-09-01" }),
  mk("erledigt2", { status: "done" }),
  mk("papierkorb", { status: "cancelled", due: "2026-10-01" }),
];

describe("projectStats", () => {
  it("zählt Fortschritt ohne Papierkorb", () => {
    const s = projectStats(AUFGABEN, HEUTE);
    expect(s.total).toBe(8);
    expect(s.done).toBe(2);
    expect(s.open).toBe(6);
    expect(s.progress).toBe(25);
  });

  it("Zeit-Zähler überschneiden sich nicht", () => {
    const s = projectStats(AUFGABEN, HEUTE);
    expect(s.overdue).toBe(1);
    expect(s.today).toBe(1);
    expect(s.week).toBe(2);     // morgen + in 7 Tagen; in 8 Tagen nicht mehr
    expect(s.noDate).toBe(1);
  });

  it("leeres Projekt: 0 %", () => {
    expect(projectStats([], HEUTE)).toMatchObject({ total: 0, done: 0, progress: 0 });
  });

  it("die Zähler schalten auf Filter, die ihre Aufgaben auch zeigen", () => {
    const offen = AUFGABEN.filter((t) => t.status === "todo");
    const zeigt = (k: keyof typeof COUNTER_RANGE): string[] =>
      filterTasks(offen, { ...DEFAULT_CRITERIA, range: COUNTER_RANGE[k] }, HEUTE).map((t) => t.id);
    expect(zeigt("overdue")).toEqual(["ueberfaellig"]);
    expect(zeigt("today")).toContain("heute");        // „Heute & überfällig" – enthält die Heutigen
    expect(zeigt("week")).toEqual(expect.arrayContaining(["morgen", "in7"]));
    expect(zeigt("noDate")).toEqual(["ohne"]);
  });
});

describe("nextTasks", () => {
  it("überfällig zuerst, dann chronologisch; Erledigtes, Papierkorb und Undatiertes nie", () => {
    expect(nextTasks(AUFGABEN, HEUTE, 10).map((n) => n.task.id)).toEqual(["ueberfaellig", "heute", "morgen", "in7", "in8"]);
  });

  it("begrenzt auf die gewünschte Zahl", () => {
    expect(nextTasks(AUFGABEN, HEUTE, 2)).toHaveLength(2);
  });

  it("eine frühere Frist zählt vor einer späteren Fälligkeit – und ist als Frist markiert", () => {
    const t = mk("frist", { due: "2026-10-20", scheduled: "2026-10-06" });
    const [n] = nextTasks([t, mk("spaeter", { due: "2026-10-07" })], HEUTE, 5);
    expect(n.task.id).toBe("frist");
    expect(n.deadline).toBe(true);
    expect(n.date).toBe("2026-10-06");
  });

  it("markiert Überfälliges", () => {
    expect(nextTasks(AUFGABEN, HEUTE, 1)[0].overdue).toBe(true);
  });
});

describe("Infos aus der Projektnotiz", () => {
  it("ohne Frontmatter und ohne die alte Namens-Überschrift", () => {
    const notiz = "---\ntype: project\nid: p-1\n---\n# Site\n\n- [[Briefing]]\n- https://example.com\n";
    expect(noteInfoBody(notiz, "Site")).toBe("- [[Briefing]]\n- https://example.com");
  });

  it("eine EIGENE Überschrift bleibt stehen", () => {
    expect(noteInfoBody("---\ntype: project\n---\n# Ziele\nText", "Site")).toBe("# Ziele\nText");
  });

  it("leere Projektnotiz = leer", () => {
    expect(noteInfoBody("---\ntype: project\n---\n\n", "Site")).toBe("");
  });

  it("frontmatterBlock trennt sauber ab", () => {
    expect(frontmatterBlock("---\na: 1\n---\nBody")).toBe("---\na: 1\n---\n");
    expect(frontmatterBlock("Nur Text")).toBe("");
  });
});
