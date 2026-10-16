import { useCallback, useEffect, useRef, useState } from "react";

export type RepositoryTarget = Readonly<{
  repository: string;
  initialBranch: string;
  initialPath: string;
  openRequestId: string;
}>;
export type EditorTarget =
  | Readonly<{ kind: "computer" }>
  | (Readonly<{ kind: "repository" }> & RepositoryTarget);

function sameEditorTarget(a: EditorTarget, b: EditorTarget): boolean {
  if (a.kind === "computer" || b.kind === "computer") return a.kind === b.kind;
  return (
    a.repository === b.repository &&
    a.initialBranch === b.initialBranch &&
    a.initialPath === b.initialPath &&
    a.openRequestId === b.openRequestId
  );
}

export type EditorSwapGate = Readonly<{
  /** The editor kind/target InkcapEntry should render. */
  mounted: EditorTarget;
  /** The mounted editor hands its own window-close consultation here, as it
   * would to its App window. A later swap away from it reuses that same
   * consultation instead of tearing it down silently. */
  registerHandle: (requestWindowClose: () => Promise<boolean>) => void;
}>;

/**
 * Gate a swap between Inkcap's Computer and repository editors behind the
 * currently mounted one's own unsaved-changes consultation. Switching
 * editors unmounts whichever is live and drops its open documents, so it
 * must never happen silently: the mounted editor is asked to save, discard
 * or cancel first, exactly as it is asked before its App window closes, and
 * the swap proceeds only once that resolves accepted. Opening another file
 * in the same editor kind is additive, never destructive, so it adopts
 * `desired` immediately with no consultation.
 */
export function useEditorSwapGate(desired: EditorTarget): EditorSwapGate {
  const [mounted, setMounted] = useState<EditorTarget>(desired);
  const handleRef = useRef<(() => Promise<boolean>) | null>(null);
  const swapping = useRef(false);
  useEffect(() => {
    if (sameEditorTarget(desired, mounted)) return;
    if (desired.kind === mounted.kind) {
      setMounted(desired);
      return;
    }
    if (swapping.current) return;
    swapping.current = true;
    const requestClose = handleRef.current ?? (() => Promise.resolve(true));
    void requestClose().then((accepted) => {
      swapping.current = false;
      if (accepted) setMounted(desired);
    });
  }, [desired, mounted]);
  const registerHandle = useCallback(
    (requestWindowClose: () => Promise<boolean>) => {
      handleRef.current = requestWindowClose;
    },
    [],
  );
  return { mounted, registerHandle };
}
