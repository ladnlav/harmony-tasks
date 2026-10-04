import { describe, it, expect } from "vitest";
import { defaultSpec, ruleToSpec, specToRule, upcomingDates, weekdayOf } from "../src/recurrenceBuilder";

const HEUTE = "2026-10-04";   // Sonntag
const DONNERSTAG = "2026-10-08";

describe("recurrenceBuilder – Editor-Felder <-> RRULE", () => {
  it("weekdayOf zählt wie rrule (0 = Montag)", () => {
    expect(weekdayOf("2026-10-05")).toBe(0);
    expect(weekdayOf(DONNERSTAG)).toBe(3);
    expect(weekdayOf(HEUTE)).toBe(6);
  });

  it("Vorbelegung aus der Fälligkeit: wöchentlich an ihrem Wochentag", () => {
    expect(specToRule(defaultSpec(DONNERSTAG, HEUTE))).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(specToRule(defaultSpec(null, HEUTE))).toBe("FREQ=WEEKLY;BYDAY=SU");   // ohne Datum: heute
  });

  it.each([
    "FREQ=WEEKLY;BYDAY=TU,TH",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO",
    "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    "FREQ=MONTHLY;BYDAY=-1FR",
    "FREQ=MONTHLY;BYDAY=2MO",
    "FREQ=MONTHLY;BYMONTHDAY=15",
    "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1",
    "FREQ=DAILY;INTERVAL=3",
    "FREQ=YEARLY",
    "FREQ=WEEKLY;BYDAY=MO;COUNT=5",
    "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231",
  ])("Rundreise ohne Verlust: %s", (rule) => {
    const spec = ruleToSpec(rule, DONNERSTAG, HEUTE);
    expect(spec).not.toBeNull();
    expect(specToRule(spec!)).toBe(rule);
  });

  it("schlichte Regeln bekommen den Tag der Fälligkeit ausdrücklich", () => {
    expect(specToRule(ruleToSpec("FREQ=WEEKLY", DONNERSTAG, HEUTE)!)).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(specToRule(ruleToSpec("FREQ=MONTHLY", DONNERSTAG, HEUTE)!)).toBe("FREQ=MONTHLY;BYMONTHDAY=8");
  });

  it("versteht auch die alte Schreibweise", () => {
    expect(specToRule(ruleToSpec("every 3 days", DONNERSTAG, HEUTE)!)).toBe("FREQ=DAILY;INTERVAL=3");
  });

  it("lehnt ab, was der Editor nicht ausdrücken kann – statt es still zu verändern", () => {
    expect(ruleToSpec("FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=2", DONNERSTAG, HEUTE)).toBeNull();
    expect(ruleToSpec("FREQ=YEARLY;BYMONTH=3", DONNERSTAG, HEUTE)).toBeNull();
    expect(ruleToSpec("FREQ=WEEKLY;BYDAY=1MO", DONNERSTAG, HEUTE)).toBeNull();
    expect(ruleToSpec("FREQ=DAILY;BYDAY=MO", DONNERSTAG, HEUTE)).toBeNull();
    expect(ruleToSpec("manchmal", DONNERSTAG, HEUTE)).toBeNull();
  });

  it("n-ter Wochentag aus der Fälligkeit: der 5. Donnerstag wird zum letzten", () => {
    const s = defaultSpec("2026-10-29", HEUTE);   // fünfter Donnerstag im Oktober
    expect(s.setPos).toBe(-1);
    expect(defaultSpec(DONNERSTAG, HEUTE).setPos).toBe(2);
  });

  it("Intervall und Grenzen werden auf gültige Werte gebracht", () => {
    const s = { ...defaultSpec(DONNERSTAG, HEUTE), interval: 0 };
    expect(specToRule(s)).toBe("FREQ=WEEKLY;BYDAY=TH");
    expect(specToRule({ ...s, unit: "month", monthMode: "day", monthDay: 40 })).toBe("FREQ=MONTHLY;BYMONTHDAY=31");
  });

  it("Vorschau: die nächsten Termine", () => {
    expect(upcomingDates("FREQ=WEEKLY;BYDAY=TU,TH", "2026-10-06", 4)).toEqual(["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15"]);
    expect(upcomingDates("FREQ=MONTHLY;BYDAY=-1FR", "2026-10-30", 2)).toEqual(["2026-10-30", "2026-11-27"]);
    expect(upcomingDates("FREQ=WEEKLY;BYDAY=MO;COUNT=2", "2026-10-05", 5)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(upcomingDates("Unsinn", "2026-10-05", 5)).toEqual([]);
  });
});
