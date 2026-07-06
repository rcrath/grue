// Small dialogs (ui-spec §6): text prompt (Add URL / Open from URL) and the
// plain-text notes editor popup. DOM-modal, no framework, works in both the
// Tauri webview and the browser-dev fallback.

/** Modal single-line text prompt. Enter/OK confirms, Escape/Cancel dismisses (null). */
export function promptText(opts: {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  ok?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dlg-overlay";
    const dlg = document.createElement("div");
    dlg.className = "dlg";
    dlg.innerHTML = `
      <div class="dlg-title"></div>
      <label class="dlg-label"><span></span><input type="text" spellcheck="false"></label>
      <div class="dlg-buttons">
        <button class="dlg-cancel">Cancel</button>
        <button class="dlg-ok"></button>
      </div>`;
    dlg.querySelector(".dlg-title")!.textContent = opts.title;
    dlg.querySelector(".dlg-label span")!.textContent = opts.label ?? "";
    const input = dlg.querySelector("input")!;
    input.value = opts.initial ?? "";
    input.placeholder = opts.placeholder ?? "";
    const okBtn = dlg.querySelector(".dlg-ok") as HTMLButtonElement;
    okBtn.textContent = opts.ok ?? "OK";
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);
    input.focus();
    input.select();

    const done = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };
    okBtn.addEventListener("click", () => done(input.value));
    (dlg.querySelector(".dlg-cancel") as HTMLButtonElement).addEventListener("click", () => done(null));
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) done(null);
    });
    dlg.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") done(input.value);
      else if (e.key === "Escape") done(null);
    });
  });
}

/** Three-way close prompt for a dirty document: Save / Don't Save / Cancel.
 *  Enter = Save, Escape (or clicking outside) = Cancel. */
export function confirmSaveClose(name: string): Promise<"save" | "discard" | "cancel"> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "dlg-overlay";
    const dlg = document.createElement("div");
    dlg.className = "dlg";
    dlg.innerHTML = `
      <div class="dlg-title">Unsaved changes</div>
      <div class="dlg-text"></div>
      <div class="dlg-buttons">
        <button class="dlg-discard">Don't Save</button>
        <button class="dlg-cancel">Cancel</button>
        <button class="dlg-ok">Save</button>
      </div>`;
    dlg.querySelector(".dlg-text")!.textContent = `Save changes to “${name}” before closing?`;
    overlay.appendChild(dlg);
    document.body.appendChild(overlay);

    const done = (value: "save" | "discard" | "cancel") => {
      overlay.remove();
      resolve(value);
    };
    const saveBtn = dlg.querySelector(".dlg-ok") as HTMLButtonElement;
    saveBtn.addEventListener("click", () => done("save"));
    (dlg.querySelector(".dlg-discard") as HTMLButtonElement).addEventListener("click", () => done("discard"));
    (dlg.querySelector(".dlg-cancel") as HTMLButtonElement).addEventListener("click", () => done("cancel"));
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) done("cancel");
    });
    dlg.tabIndex = -1;
    dlg.addEventListener("keydown", (e) => {
      e.stopPropagation();
      // Enter on a focused button activates THAT button (native click), not Save
      if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") done("save");
      else if (e.key === "Escape") done("cancel");
    });
    saveBtn.focus();
  });
}

/** Plain-text notes editor popup (nodes/links). Saves on close or blur;
 *  Escape discards changes made since open (ui-spec §6). */
export function openNotesEditor(opts: {
  title: string;
  initial: string;
  onSave: (text: string) => void;
}): void {
  // one notes popup at a time
  document.querySelector(".notes-pop")?.remove();

  const pop = document.createElement("div");
  pop.className = "notes-pop";
  pop.innerHTML = `
    <div class="notes-head"><span class="notes-title"></span><button class="notes-close" title="Save and close">✕</button></div>
    <textarea spellcheck="false" placeholder="notes"></textarea>`;
  pop.querySelector(".notes-title")!.textContent = opts.title;
  const box = pop.querySelector("textarea")!;
  box.value = opts.initial;
  document.body.appendChild(pop);
  box.focus();

  let finished = false;
  const finish = (save: boolean) => {
    if (finished) return;
    finished = true;
    const value = box.value;
    pop.remove();
    if (save && value !== opts.initial) opts.onSave(value);
  };
  (pop.querySelector(".notes-close") as HTMLButtonElement).addEventListener("click", () => finish(true));
  box.addEventListener("blur", () => {
    // clicking the close button also blurs; let its handler run first
    setTimeout(() => finish(true), 120);
  });
  box.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
}
