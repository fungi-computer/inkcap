import { AppError } from "@fungi.computer/agar/errors";
import { useRef, useState } from "react";
import { acknowledgeSave, editDraft, isDirty } from "./draft.js";

export type DocumentTarget = {
  revision: number;
  closed: boolean;
  dirty: boolean;
  saving: boolean;
};

export function useFileDocument({
  path,
  initial,
  local,
  onSaveAs,
  onPathChange,
  onStatus,
  write,
  overwrite,
  readCurrent,
  target,
  syncConflict = false,
}: {
  path: string;
  initial: string;
  local: boolean;
  onSaveAs?: (path: string, contents: string) => Promise<string>;
  onPathChange?: (path: string) => void;
  onStatus: (dirty: boolean, saving: boolean) => void;
  write: (contents: string, expectedContent: string) => Promise<void>;
  overwrite: (contents: string) => Promise<void>;
  readCurrent: (reload: boolean) => Promise<string>;
  target?: DocumentTarget;
  syncConflict?: boolean;
}) {
  const draft = useRef({ saved: initial, contents: initial });
  const currentPath = useRef(path);
  const writeRef = useRef(write);
  const overwriteRef = useRef(overwrite);
  const readRef = useRef(readCurrent);
  const saveAsRef = useRef(onSaveAs);
  const pathChangeRef = useRef(onPathChange);
  const statusRef = useRef(onStatus);
  const targetRef = useRef(target);
  writeRef.current = write;
  overwriteRef.current = overwrite;
  readRef.current = readCurrent;
  saveAsRef.current = onSaveAs;
  pathChangeRef.current = onPathChange;
  statusRef.current = onStatus;
  targetRef.current = target;

  const [dirty, setDirty] = useState(false);
  const [contents, setContents] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const conflicting = useRef(false);
  const externalConflict = useRef(syncConflict);
  externalConflict.current = syncConflict;
  function markConflict(value: boolean): void {
    conflicting.current = value;
    setConflict(value);
  }
  const [comparison, setComparison] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [imageError, setImageError] = useState(false);
  const busy = useRef(false);
  const reported = useRef({ dirty: false, saving: false });

  function report(nextDirty: boolean, nextSaving: boolean): void {
    setDirty(nextDirty);
    setSaving(nextSaving);
    const currentTarget = targetRef.current;
    if (currentTarget) {
      currentTarget.revision += 1;
      currentTarget.dirty = nextDirty;
      currentTarget.saving = nextSaving;
    }
    if (
      reported.current.dirty !== nextDirty ||
      reported.current.saving !== nextSaving
    ) {
      reported.current = { dirty: nextDirty, saving: nextSaving };
      statusRef.current(nextDirty, nextSaving);
    }
  }

  function edit(contents: string): void {
    draft.current = editDraft(draft.current, contents);
    // The editor keeps its live contents without using workbench status updates
    // to rerender the tree and every sibling tab on each keystroke.
    setContents(contents);
    report(
      isDirty(draft.current) || conflicting.current,
      reported.current.saving,
    );
  }

  async function save(): Promise<boolean> {
    if (
      busy.current ||
      conflict ||
      externalConflict.current ||
      !isDirty(draft.current)
    )
      return false;
    busy.current = true;
    report(true, true);
    setError("");
    const written = draft.current.contents;
    try {
      await writeRef.current(written, draft.current.saved);
      draft.current = acknowledgeSave(draft.current, written);
      report(isDirty(draft.current) || conflicting.current, true);
      return true;
    } catch (cause) {
      if (cause instanceof AppError && cause.code === "CANCELLED") return false;
      if (cause instanceof AppError && cause.code === "CONFLICT") {
        markConflict(true);
        setComparison(null);
        return false;
      }
      console.error("Inkcap save failed", cause);

      const message = local
        ? "Download could not start. Your edits remain in this tab."
        : "Save was denied or failed. Your edits remain in this tab; retry with the same or another path.";
      setError(message);
      throw new Error(message, { cause });
    } finally {
      busy.current = false;
      report(isDirty(draft.current) || conflicting.current, false);
    }
  }

  async function keepMine(): Promise<boolean> {
    if ((!conflict && !externalConflict.current) || busy.current) return false;
    busy.current = true;
    report(true, true);
    setError("");
    const written = draft.current.contents;
    try {
      await overwriteRef.current(written);
      draft.current = acknowledgeSave(draft.current, written);
      markConflict(false);
      setComparison(null);
      return true;
    } catch (cause) {
      if (cause instanceof AppError && cause.code === "CANCELLED") return false;
      console.error("Inkcap explicit overwrite failed", cause);
      setError("Could not overwrite the file. Your edits remain in this tab.");
      return false;
    } finally {
      busy.current = false;
      report(isDirty(draft.current) || conflicting.current, false);
    }
  }

  async function readConflict(reload: boolean): Promise<boolean> {
    if ((!conflict && !externalConflict.current) || busy.current) return false;
    busy.current = true;
    setResolving(true);
    setError("");
    const revision = targetRef.current?.revision;
    const before = draft.current.contents;
    try {
      const theirs = await readRef.current(reload);
      if (targetRef.current?.closed) return false;
      if (!reload) {
        setComparison(theirs);
        return true;
      }
      if (
        draft.current.contents !== before ||
        targetRef.current?.revision !== revision
      ) {
        setError(
          "Your edits changed while reloading. They remain in this tab; compare or reload again.",
        );
        return false;
      }
      draft.current = { saved: theirs, contents: theirs };
      setContents(theirs);
      markConflict(false);
      setComparison(null);
      setReloadVersion((version) => version + 1);
      report(false, false);
      return true;
    } catch (cause) {
      console.error("Inkcap conflict read failed", cause);
      setError("Could not read the file. Your edits remain in this tab.");
      return false;
    } finally {
      busy.current = false;
      setResolving(false);
    }
  }

  async function saveAs(nextPath: string): Promise<boolean> {
    const normalizedPath = nextPath.trim();
    if (!local && normalizedPath === currentPath.current) return save();
    if (!normalizedPath || normalizedPath.endsWith("/") || busy.current)
      return false;
    busy.current = true;
    report(true, true);
    setError("");
    const written = draft.current.contents;
    try {
      if (!saveAsRef.current) throw new Error("Save As is unavailable");
      const acceptedPath = await saveAsRef.current(normalizedPath, written);
      draft.current = acknowledgeSave(draft.current, written);
      currentPath.current = acceptedPath;
      markConflict(false);
      setComparison(null);
      pathChangeRef.current?.(acceptedPath);
      report(isDirty(draft.current) || conflicting.current, true);
      return true;
    } catch (cause) {
      if (cause instanceof AppError && cause.code === "CANCELLED") return false;
      console.error("Inkcap save failed", cause);

      setError(
        "Save As was denied or failed. Your edits remain in this tab; retry with the same or another path.",
      );
      return false;
    } finally {
      busy.current = false;
      report(isDirty(draft.current) || conflicting.current, false);
    }
  }

  return {
    currentPath: currentPath.current,
    contents,
    dirty,
    saving,
    error,
    conflict: conflict || syncConflict,
    comparison,
    resolving,
    reloadVersion,
    keepMine,
    compare: () => readConflict(false),
    reloadTheirs: () => readConflict(true),
    closeComparison: () => {
      setComparison(null);
    },
    imageError,
    setImageError,
    edit,
    save,
    saveAs,
  };
}
