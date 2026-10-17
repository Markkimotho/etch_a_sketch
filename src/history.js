// Undo/redo for a drawing { size, cells }.
// Strokes are stored as diffs (only the cells they touched); resizes as full snapshots.

export class History {
  constructor(limit = 200) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get inStroke() { return this.pending !== null; }

  begin() {
    this.pending = new Map();
  }

  // The first "before" for a cell wins, the last "after" wins, so a stroke that
  // passes over a cell several times still undoes to the original color.
  record(index, before, after) {
    if (!this.pending) throw new Error('record() called outside begin()/commit()');
    const entry = this.pending.get(index);
    if (entry) entry[1] = after;
    else this.pending.set(index, [before, after]);
  }

  // Returns true when the stroke changed something and was stored.
  commit() {
    const changes = this.pending;
    this.pending = null;
    if (!changes) return false;
    for (const [i, [before, after]] of changes) if (before === after) changes.delete(i);
    if (changes.size === 0) return false;
    this.push({ type: 'diff', changes });
    return true;
  }

  pushSnapshot(before, after) {
    this.push({
      type: 'snapshot',
      before: { size: before.size, cells: before.cells.slice() },
      after: { size: after.size, cells: after.cells.slice() },
    });
  }

  push(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  // Both return null when there is nothing to do, otherwise
  // { rebuild: true } (size may have changed) or { rebuild: false, changed: [indices] }.
  undo(drawing) {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return applyEntry(entry, drawing, 'undo');
  }

  redo(drawing) {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    return applyEntry(entry, drawing, 'redo');
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pending = null;
  }
}

function applyEntry(entry, drawing, direction) {
  if (entry.type === 'snapshot') {
    const target = direction === 'undo' ? entry.before : entry.after;
    drawing.size = target.size;
    drawing.cells = target.cells.slice();
    return { rebuild: true };
  }
  const changed = [];
  for (const [i, [before, after]] of entry.changes) {
    drawing.cells[i] = direction === 'undo' ? before : after;
    changed.push(i);
  }
  return { rebuild: false, changed };
}
