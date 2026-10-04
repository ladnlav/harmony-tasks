import { Task } from "./types";
import { ShiftedDates, shiftDates, shiftReminder } from "./templatePlan";
import { dayOffset } from "./format";
import { isDone, isTrashed } from "./statuses";
import { subtasksToDuplicate } from "./filterEngine";

/**
 * Was eine wiederkehrende Aufgabe in ihre NÄCHSTE Runde mitnimmt.
 *
 * Wiederholt wird über eine Kette neuer Notizen (s. recurrence.ts): Beim Abhaken entsteht die
 * Folgeaufgabe als eigene Notiz. Bis hierher bekam sie nur Titel, Daten und Regel – Beschreibung,
 * Checkliste und Unteraufgaben blieben an der erledigten Runde hängen, und die Routine war in der
 * nächsten Woche nur noch eine leere Hülle.
 *
 * Die Regel jetzt:
 *   • Die Folgeaufgabe bekommt FRISCHE Kopien der Unteraufgaben (alle offen), samt Checklisten.
 *   • Deren Daten wandern um denselben Betrag wie die der Aufgabe selbst – wer „zwei Tage vorher
 *     Material besorgen" eingeplant hat, will das auch in der nächsten Runde.
 *   • Unerledigte Unteraufgaben der ALTEN Runde gehen in den Papierkorb: Ihre Kopie steht in der
 *     neuen Runde, und ein offener Rest unter einer erledigten Aufgabe tauchte sonst als Doppel in
 *     „Heute" und im Projekt auf. Aus dem Papierkorb lassen sie sich wiederherstellen.
 *   • Erledigte Unteraufgaben bleiben, wo sie sind – die alte Runde zeigt, was getan wurde.
 *
 * Eine Ausnahme beim Kopieren: ERLEDIGTE Unteraufgaben, die selbst wiederkehren. Sie bilden ihre
 * eigene Kette unter derselben Elternaufgabe; ihr offener Nachfolger steht bereits daneben und wird
 * kopiert. Kämen auch die erledigten Glieder mit, vervielfachte sich die Kette mit jeder Runde.
 *
 * Rein (ohne App/DOM): Die Kinder kommen über `children` herein – wie bei TaskIndex.descendants
 * mit Kreis-Schutz, denn `parent` ist ein von Hand schreibbares Feld.
 */

/** Daten der Folgeaufgabe, wie nextInstance (recurrence.ts) sie liefert. */
export interface NextDates { due: string | null; scheduled: string | null; }

export interface CarryPlan {
  /** Um so viele Tage wandert die Runde (Folge- minus Ausgangsdatum). */
  shiftDays: number;
  /** Welche Kinder (auf JEDER Ebene) der Kopierer übernimmt – s. DuplicateOpts.pick. */
  pick: (kid: Task) => boolean;
  /** Was kopiert wird, in Baum-Reihenfolge – für die Meldung und die Tests. */
  copied: Task[];
  /** Verschobene Daten je kopierter Aufgabe (Pfad), s. templatePlan.shiftDates. */
  dates: Map<string, ShiftedDates>;
  /** Unerledigte Unteraufgaben der alten Runde -> Papierkorb (samt ihrem Unterbaum). */
  trash: Task[];
  /** Erinnerungen der Folgeaufgabe: absolute mitverschoben, relative unverändert. */
  reminders: string[];
}

/** Abstand zwischen alter und neuer Runde in Tagen: über die Fälligkeit, sonst die Deadline. */
export function carryShift(from: NextDates, to: NextDates): number {
  if (from.due && to.due) return dayOffset(to.due, from.due);
  if (from.scheduled && to.scheduled) return dayOffset(to.scheduled, from.scheduled);
  return 0;
}

/** Wird dieses Kind in die nächste Runde kopiert? */
export const carriesOver = (kid: Task): boolean => !isTrashed(kid.status) && !(kid.recurrence && isDone(kid.status));

export function planCarry(task: Task, next: NextDates, children: (path: string) => Task[]): CarryPlan {
  const shiftDays = carryShift(task, next);

  const copied: Task[] = [];
  const trash: Task[] = [];
  const gesehen = new Set<string>([task.path]);
  // EIN Durchlauf für beides. Reihenfolge wie beim Kopierer (subtasksToDuplicate), damit `copied`
  // genau das abbildet, was duplicateSubtree gleich anlegen wird.
  const walk = (path: string, kopieren: boolean, aufraeumen: boolean): void => {
    if (!kopieren && !aufraeumen) return;
    for (const kid of subtasksToDuplicate(children(path))) {
      if (gesehen.has(kid.path)) continue;
      gesehen.add(kid.path);
      const mit = kopieren && carriesOver(kid);
      if (mit) copied.push(kid);
      // Unerledigt -> in den Papierkorb; der Unterbaum geht dort per Kaskade mit, muss also nicht
      // einzeln gesammelt werden. Unter einer ERLEDIGTEN Unteraufgabe wird weiter gesucht: Auch
      // dort darf kein offener Rest unter der abgeschlossenen Runde stehen bleiben.
      const offen = aufraeumen && !isDone(kid.status);
      if (offen) trash.push(kid);
      walk(kid.path, mit, aufraeumen && !offen);
    }
  };
  walk(task.path, true, true);

  return {
    shiftDays,
    pick: carriesOver,
    copied,
    dates: shiftDates(copied, shiftDays),
    trash,
    reminders: task.reminders.map((r) => shiftReminder(r, shiftDays)),
  };
}
