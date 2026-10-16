/** Retained pane-editors draft/save semantics, scoped to one App tab in memory. */
export type Draft = { saved: string; contents: string };
export function editDraft(draft: Draft, contents: string): Draft {
  return { ...draft, contents };
}
/** A completed save acknowledges only the captured bytes, never newer edits. */
export function acknowledgeSave(draft: Draft, written: string): Draft {
  return { ...draft, saved: written };
}
export function isDirty(draft: Draft): boolean {
  return draft.contents !== draft.saved;
}
