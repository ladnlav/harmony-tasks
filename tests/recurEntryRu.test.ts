import { describe, it, expect } from "vitest";
import { parseQuickEntry } from "../src/quickEntry";
import { parseRecurrence, isValidRecurrence } from "../src/recurrence";

// Bezugspunkt fest: Montag, 15.06.2026. Ohne chrono-Rückfall (`[]`), damit das Ergebnis nicht an
// der Spracheinstellung der Testumgebung hängt.
const MONTAG = new Date(2026, 5, 15, 12, 0, 0);
const parse = (raw: string) => parseQuickEntry(raw, [], MONTAG, []);

describe("Wiederholung – mehrere Wochentage (EN/DE)", () => {
  it.each([
    ["every monday and thursday gym", "FREQ=WEEKLY;BYDAY=MO,TH", "gym", "2026-06-18"],
    ["every mon, wed and fri", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "", "2026-06-17"],
    ["jeden Montag und Donnerstag Sport", "FREQ=WEEKLY;BYDAY=MO,TH", "Sport", "2026-06-18"],
    ["every thursday & tuesday", "FREQ=WEEKLY;BYDAY=TU,TH", "", "2026-06-16"],
  ])("%s", (raw, rule, title, due) => {
    const r = parse(raw);
    expect(r.recurrence).toBe(rule);
    expect(r.title).toBe(title);
    expect(r.faellig).toBe(due);   // erster Termin NACH heute – wie „jeden Montag" schon immer
  });

  it("Intervall plus Tage", () => {
    expect(parse("every 2 weeks on tue and thu").recurrence).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH");
    expect(parse("every other week on friday").recurrence).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=FR");
    expect(parse("alle 2 Wochen am Montag und Donnerstag").recurrence).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH");
  });

  it("Werktage und Wochenende", () => {
    expect(parse("weekdays standup").recurrence).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(parse("Standup werktags").recurrence).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(parse("every weekend hike").recurrence).toBe("FREQ=WEEKLY;BYDAY=SA,SU");
  });

  it("ein einzelner Tag bleibt beim bisherigen Weg", () => {
    expect(parse("every monday standup").recurrence).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(parse("every monday standup").faellig).toBe("2026-06-22");
  });

  it("„and“ ohne zweiten Tag macht keine Aufzählung", () => {
    const r = parse("every monday and also more");
    expect(r.recurrence).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(r.title).toBe("and also more");
  });
});

describe("Wiederholung – Russisch", () => {
  it.each([
    ["Пробежка каждый вторник и четверг", "FREQ=WEEKLY;BYDAY=TU,TH", "Пробежка", "2026-06-16"],
    ["Отчёт по вторникам и четвергам", "FREQ=WEEKLY;BYDAY=TU,TH", "Отчёт", "2026-06-16"],
    ["каждую среду йога", "FREQ=WEEKLY;BYDAY=WE", "йога", "2026-06-17"],
    ["планёрка каждый понедельник", "FREQ=WEEKLY;BYDAY=MO", "планёрка", "2026-06-22"],
    ["стендап по будням", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "стендап", "2026-06-16"],
    ["уборка по выходным", "FREQ=WEEKLY;BYDAY=SA,SU", "уборка", "2026-06-20"],
    ["отчёт в последнюю пятницу месяца", "FREQ=MONTHLY;BYDAY=-1FR", "отчёт", "2026-06-26"],
    ["каждый первый понедельник месяца ревью", "FREQ=MONTHLY;BYDAY=1MO", "ревью", "2026-07-06"],
  ])("%s", (raw, rule, title, due) => {
    const r = parse(raw);
    expect(r.recurrence).toBe(rule);
    expect(r.title).toBe(title);
    expect(r.faellig).toBe(due);
  });

  it.each([
    ["каждый день зарядка", "FREQ=DAILY"],
    ["каждые 3 дня полив", "FREQ=DAILY;INTERVAL=3"],
    ["каждую неделю отчёт", "FREQ=WEEKLY"],
    ["каждые 2 недели", "FREQ=WEEKLY;INTERVAL=2"],
    ["каждый месяц аренда", "FREQ=MONTHLY"],
    ["каждый год страховка", "FREQ=YEARLY"],
    ["каждые 2 года техосмотр", "FREQ=YEARLY;INTERVAL=2"],
    ["раз в неделю звонок", "FREQ=WEEKLY"],
    ["раз в 2 недели", "FREQ=WEEKLY;INTERVAL=2"],
    ["через день", "FREQ=DAILY;INTERVAL=2"],
    ["ежедневно", "FREQ=DAILY"],
    ["еженедельно", "FREQ=WEEKLY"],
    ["ежемесячно", "FREQ=MONTHLY"],
    ["ежегодно", "FREQ=YEARLY"],
    ["каждую вторую неделю", "FREQ=WEEKLY;INTERVAL=2"],
    ["каждый второй понедельник", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"],
    ["каждые 2 недели по вторникам и четвергам", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH"],
    ["оплата 15 числа каждого месяца", "FREQ=MONTHLY;BYMONTHDAY=15"],
    ["каждое 5-е число", "FREQ=MONTHLY;BYMONTHDAY=5"],
    ["ежемесячно 20 числа", "FREQ=MONTHLY;BYMONTHDAY=20"],
  ])("%s -> %s", (raw, rule) => {
    expect(parse(raw).recurrence).toBe(rule);
  });

  it("ohne Tagesvorgabe beginnt die Regel heute", () => {
    expect(parse("каждый день зарядка").faellig).toBe("2026-06-15");
    expect(parse("оплата 15 числа каждого месяца").faellig).toBe("2026-06-15");
  });

  it("entfernt die Phrase aus dem Titel und meldet sie als Auslöser", () => {
    const r = parse("Пробежка каждый вторник и четверг");
    expect(r.title).toBe("Пробежка");
    expect(r.recurSrc).toBe("каждый вторник и четверг");
  });

  it("lässt gewöhnliche Wörter in Ruhe", () => {
    expect(parse("купить ежедневник").recurrence).toBeNull();     // nicht „ежедневно"
    expect(parse("новый еженедельник").recurrence).toBeNull();
    expect(parse("отпуск с понедельника по субботу").recurrence).toBeNull();   // „по субботу" = bis Samstag
    expect(parse("каждый должен прийти").recurrence).toBeNull();
  });

  it("erzeugt ausschliesslich Regeln, die recurrence.ts versteht", () => {
    for (const raw of ["каждый вторник и четверг", "по будням", "каждые 3 дня", "в последнюю пятницу месяца", "15 числа каждого месяца"]) {
      const r = parse(raw).recurrence;
      expect(r, raw).not.toBeNull();
      expect(isValidRecurrence(r!), raw).toBe(true);
    }
    expect(parseRecurrence(parse("каждые 3 дня").recurrence!)).toEqual({ n: 3, unit: "day" });
  });
});
