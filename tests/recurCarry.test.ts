import { describe, it, expect, beforeAll } from "vitest";
import { Task } from "../src/types";
import { planCarry, carryShift, carriesOver } from "../src/recurCarry";
import { shiftDates } from "../src/templatePlan";
import { initStatuses } from "../src/statuses";

beforeAll(() => initStatuses());   // Default-Status (todo/doing/done/cancelled) für isDone/isTrashed

function mk(id: string, over: Partial<Task> = {}): Task {
  return {
    id, path: "Items/" + id + ".md", title: id, titleInFm: true, status: "todo", priority: "normal",
    due: null, dueTime: null, scheduled: null, scheduledTime: null, duration: null, start: null,
    sortOrder: null, project: null, parent: null, labels: [], description: "", recurrence: null,
    recurBasis: "due", reminders: [], created: "2026-07-01", completed: null, cancelled: null,
    externalId: null, checklist: [], ...over,
  };
}

/** Kleiner Baum: `kinder` nach Eltern-Pfad. */
function baum(...tasks: Task[]): (p: string) => Task[] {
  return (p) => tasks.filter((t) => t.parent === p);
}

const RUNDE = mk("Wochenreview", { due: "2026-07-03", recurrence: "FREQ=WEEKLY", reminders: ["-30m", "2026-07-03T08:00"] });
const NAECHSTE = { due: "2026-07-10", scheduled: null };

describe("carryShift – um wie viel die Runde wandert", () => {
  it("über die Fälligkeit", () => {
    expect(carryShift({ due: "2026-07-03", scheduled: null }, { due: "2026-07-10", scheduled: null })).toBe(7);
  });
  it("ersatzweise über die Deadline", () => {
    expect(carryShift({ due: null, scheduled: "2026-07-01" }, { due: null, scheduled: "2026-08-01" })).toBe(31);
  });
  it("ohne gemeinsames Datum gar nicht", () => {
    expect(carryShift({ due: null, scheduled: null }, { due: "2026-07-10", scheduled: null })).toBe(0);
  });
});

describe("planCarry – was in die nächste Runde kommt", () => {
  const P = RUNDE.path;
  const offen = mk("Eingang leeren", { parent: P, sortOrder: 10 });
  const erledigt = mk("Kalender prüfen", { parent: P, sortOrder: 20, status: "done", due: "2026-07-02" });
  const papierkorb = mk("Alt", { parent: P, status: "cancelled" });
  const enkel = mk("Notizen sichten", { parent: offen.path, due: "2026-07-01" });

  it("kopiert offene UND erledigte Unteraufgaben, nicht den Papierkorb", () => {
    const plan = planCarry(RUNDE, NAECHSTE, baum(offen, erledigt, papierkorb, enkel));
    expect(plan.copied.map((t) => t.id)).toEqual(["Eingang leeren", "Notizen sichten", "Kalender prüfen"]);
  });

  it("verschiebt die Daten der Kopien um denselben Betrag", () => {
    const plan = planCarry(RUNDE, NAECHSTE, baum(offen, erledigt, enkel));
    expect(plan.shiftDays).toBe(7);
    expect(plan.dates.get(erledigt.path)?.due).toBe("2026-07-09");
    expect(plan.dates.get(enkel.path)?.due).toBe("2026-07-08");
    expect(plan.dates.get(offen.path)?.due).toBeNull();   // ohne Datum bleibt ohne Datum
  });

  it("verschiebt absolute Erinnerungen der Aufgabe, relative bleiben", () => {
    const plan = planCarry(RUNDE, NAECHSTE, baum());
    expect(plan.reminders).toEqual(["-30m", "2026-07-10T08:00"]);
  });

  it("unerledigte Unteraufgaben der alten Runde gehen in den Papierkorb – der Unterbaum per Kaskade", () => {
    const plan = planCarry(RUNDE, NAECHSTE, baum(offen, erledigt, enkel));
    // `enkel` steht nicht einzeln da: Er hängt unter `offen` und geht mit dessen Kaskade.
    expect(plan.trash.map((t) => t.id)).toEqual(["Eingang leeren"]);
  });

  it("findet offene Reste auch unter ERLEDIGTEN Unteraufgaben", () => {
    const rest = mk("Rest", { parent: erledigt.path });
    const plan = planCarry(RUNDE, NAECHSTE, baum(erledigt, rest));
    expect(plan.trash.map((t) => t.id)).toEqual(["Rest"]);
    expect(plan.copied.map((t) => t.id)).toEqual(["Kalender prüfen", "Rest"]);
  });

  it("erledigte WIEDERKEHRENDE Unteraufgaben bleiben zurück – sonst vervielfacht sich ihre Kette", () => {
    const glied1 = mk("Pflanzen gießen", { parent: P, recurrence: "FREQ=DAILY", status: "done", due: "2026-07-01" });
    const glied2 = mk("Pflanzen gießen 2", { parent: P, recurrence: "FREQ=DAILY", due: "2026-07-02" });
    const plan = planCarry(RUNDE, NAECHSTE, baum(glied1, glied2));
    expect(plan.copied.map((t) => t.id)).toEqual(["Pflanzen gießen 2"]);
    expect(plan.trash.map((t) => t.id)).toEqual(["Pflanzen gießen 2"]);   // die alte offene geht, ihre Kopie kommt
    expect(carriesOver(glied1)).toBe(false);
    expect(carriesOver(glied2)).toBe(true);
  });

  it("übersteht einen von Hand gebauten Kreis", () => {
    const a = mk("a", { parent: P });
    const b = mk("b", { parent: a.path });
    const zurueck = { ...a, parent: b.path };   // a -> b -> a
    const kinder = (p: string): Task[] => (p === P ? [a] : p === a.path ? [b] : p === b.path ? [zurueck] : []);
    const plan = planCarry(RUNDE, NAECHSTE, kinder);
    expect(plan.copied.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("ohne Unteraufgaben gibt es nichts zu tun", () => {
    const plan = planCarry(RUNDE, NAECHSTE, baum());
    expect(plan.copied).toEqual([]);
    expect(plan.trash).toEqual([]);
  });
});

describe("shiftDates – gemeinsamer Rechenweg mit den Vorlagen", () => {
  it("verschiebt Fälligkeit, Deadline und absolute Erinnerungen", () => {
    const m = shiftDates([{ path: "a", due: "2026-07-30", scheduled: "2026-08-01", reminders: ["-1d", "2026-07-29T09:00"] }], 3);
    expect(m.get("a")).toEqual({ due: "2026-08-02", scheduled: "2026-08-04", reminders: ["-1d", "2026-08-01T09:00"] });
  });
  it("0 Tage = unverändert", () => {
    const m = shiftDates([{ path: "a", due: "2026-07-30", scheduled: null, reminders: [] }], 0);
    expect(m.get("a")).toEqual({ due: "2026-07-30", scheduled: null, reminders: [] });
  });
});
