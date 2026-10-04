import { App, Keymap } from "obsidian";

/**
 * Links in gerendertem Markdown außerhalb einer Markdown-Ansicht klickbar machen.
 *
 * MarkdownRenderer zeichnet die Links, öffnet sie in einer eigenen View aber nicht von selbst:
 * Interne Links brauchen openLinkText (mit Modifier = neuer Tab, wie überall in Obsidian),
 * externe ein window.open. Derselbe Weg wie renderLinkedText in heuteView – hier für die Blöcke,
 * die ganze Absätze rendern (Projekt-Überblick, Abschnittsbeschreibungen).
 */
export function wireLinkClicks(el: HTMLElement, app: App, sourcePath: string): void {
  el.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    if (a.classList.contains("internal-link")) {
      const href = a.getAttribute("data-href") || a.getAttribute("href") || "";
      void app.workspace.openLinkText(href, sourcePath, Keymap.isModEvent(e));
    } else {
      const href = a.getAttribute("href");
      if (href) window.open(href);
    }
  });
}
