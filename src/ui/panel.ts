// Floating panel base (wave 3): draggable title bar, close button, and
// localStorage-remembered open state + position. The format palette and all
// wave-3 panels (layers, info, map info, outline, panner, search) extend this.
// Panel state is UI-only: never part of the document or undo history.

import { getPref, removePref, setPref } from "./prefs";

export interface PanelOpts {
  key: string; // pref key suffix: panel.<key>.open / panel.<key>.pos
  title: string;
  className?: string; // extra CSS class on the root
  closeHint?: string; // tooltip on the ✕ button, e.g. "Close (Ctrl+5)"
  defaultPos: { left?: number; top?: number; right?: number; bottom?: number };
}

interface SavedPos {
  left: number;
  top: number;
}

export class FloatingPanel {
  readonly root: HTMLElement;
  protected head: HTMLElement;
  private visible = false;
  private opts: PanelOpts;

  constructor(opts: PanelOpts) {
    this.opts = opts;
    this.root = document.createElement("div");
    this.root.className = "panel" + (opts.className ? ` ${opts.className}` : "");
    this.root.style.display = "none";

    this.head = document.createElement("div");
    this.head.className = "palette-head";
    const title = document.createElement("span");
    title.textContent = opts.title;
    const close = document.createElement("button");
    close.className = "palette-close";
    close.textContent = "✕";
    close.title = opts.closeHint ?? "Close";
    close.addEventListener("click", () => this.hide());
    this.head.append(title, close);
    this.makeDraggable();
    this.root.appendChild(this.head);
    document.body.appendChild(this.root);

    this.applyPos(getPref<SavedPos | null>(`panel.${opts.key}.pos`, null));
  }

  isOpen(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.root.style.display = "";
    setPref(`panel.${this.opts.key}.open`, true);
    this.onShow();
    this.refresh();
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.style.display = "none";
    setPref(`panel.${this.opts.key}.open`, false);
  }

  /** Reopen the panel if it was open last session. */
  restore(): void {
    if (getPref(`panel.${this.opts.key}.open`, false)) this.show();
  }

  /** Gather Windows: forget the dragged position, go back to the default spot. */
  gather(): void {
    removePref(`panel.${this.opts.key}.pos`);
    this.applyPos(null);
  }

  /** Re-sync panel contents with the editor. No-op unless overridden; panels
   *  are expected to bail out immediately when closed. */
  refresh(): void {}

  /** Hook for subclasses; runs right before the first refresh after opening. */
  protected onShow(): void {}

  private applyPos(saved: SavedPos | null): void {
    const s = this.root.style;
    s.left = s.top = s.right = s.bottom = "auto";
    if (saved) {
      s.left = `${Math.max(0, Math.min(innerWidth - 60, saved.left))}px`;
      s.top = `${Math.max(0, Math.min(innerHeight - 40, saved.top))}px`;
      return;
    }
    const d = this.opts.defaultPos;
    if (d.left != null) s.left = `${d.left}px`;
    if (d.top != null) s.top = `${d.top}px`;
    if (d.right != null) s.right = `${d.right}px`;
    if (d.bottom != null) s.bottom = `${d.bottom}px`;
  }

  private makeDraggable(): void {
    this.head.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).tagName === "BUTTON") return;
      const r = this.root.getBoundingClientRect();
      const offX = e.clientX - r.left,
        offY = e.clientY - r.top;
      const move = (ev: PointerEvent) => {
        this.root.style.left = `${Math.max(0, Math.min(innerWidth - 60, ev.clientX - offX))}px`;
        this.root.style.top = `${Math.max(0, Math.min(innerHeight - 40, ev.clientY - offY))}px`;
        this.root.style.right = "auto";
        this.root.style.bottom = "auto";
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const rr = this.root.getBoundingClientRect();
        setPref(`panel.${this.opts.key}.pos`, { left: rr.left, top: rr.top } satisfies SavedPos);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      e.preventDefault();
    });
  }
}
