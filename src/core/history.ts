// Snapshot-based undo/redo. Documents are small enough (hundreds of items)
// that whole-doc snapshots are simpler and safer than inverse commands.

import { GDoc, cloneDoc } from "./model";

const MAX_DEPTH = 200;

export class History {
  private undoStack: GDoc[] = [];
  private redoStack: GDoc[] = [];

  /** Capture state BEFORE a mutation. Clears the redo stack. */
  checkpoint(doc: GDoc): void {
    this.undoStack.push(cloneDoc(doc));
    if (this.undoStack.length > MAX_DEPTH) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(current: GDoc): GDoc | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(cloneDoc(current));
    return prev;
  }

  redo(current: GDoc): GDoc | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneDoc(current));
    return next;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
