// Print / Export PDF (wave 4). A cloned, fitted copy of the map SVG goes into
// a print-only container and the webview's own print dialog does the rest —
// "Export PDF" is the same pipeline, the user picks "Save as PDF" in the
// system dialog. The print stylesheet in style.css hides everything except
// #print-container while printing. No PDF library, one map per page.

import { Editor } from "./editor";

/** "fit" = whole map zoomed to fill the page; "viewport" = what's on screen now. */
export function printMap(editor: Editor, mode: "fit" | "viewport"): void {
  const svg = editor.printableSvg(mode);
  if (!svg) {
    alert("Nothing to print — the map is empty.");
    return;
  }

  document.getElementById("print-container")?.remove();
  const holder = document.createElement("div");
  holder.id = "print-container";
  holder.appendChild(svg);
  document.body.appendChild(holder);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    holder.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // Chromium/WebView2 block inside print() while the dialog is open, so the
  // timeout below only starts once the dialog has closed. WebKit returns
  // earlier and fires afterprint when the dialog closes; the timeout is a
  // fallback for webviews that never fire afterprint.
  window.print();
  setTimeout(cleanup, 5000);
}
