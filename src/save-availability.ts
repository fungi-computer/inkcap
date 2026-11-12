import type { InkcapSaveAvailability } from "./commands.js";

/** What decides whether Save applies to one mounted document right now. */
export type SaveState = Readonly<{
  /** A draft has no file yet, so Save asks where to put it. */
  local: boolean;
  closed: boolean;
  savable: boolean;
  saving: boolean;
  dirty: boolean;
}>;

/** The one source for the Save command and the File menu item. */
export function saveAvailability(state: SaveState): InkcapSaveAvailability {
  if (state.local) {
    if (state.closed)
      return { status: "unavailable", reason: "This draft is closed." };
  } else if (state.closed || !state.savable)
    return { status: "unavailable", reason: "No focused savable document." };
  if (state.saving)
    return { status: "unavailable", reason: "A save is already running." };
  if (!state.local && !state.dirty)
    return { status: "unavailable", reason: "No unsaved changes." };
  return { status: "available" };
}
