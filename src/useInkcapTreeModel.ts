import { useEffect, useLayoutEffect, useRef } from "react";
import { useFileTree } from "@pierre/trees/react";
import type { AppRoot } from "@fungi.computer/agar";
import {
  createComputerTreeSyncState,
  isHiddenEntry,
  resetComputerTree,
  revealParents,
  syncComputerTree,
  useComputerTreePages,
} from "@fungi.computer/agar/computer-tree";
import { describeAppError } from "@fungi.computer/agar/errors";
import * as Redacted from "effect/Redacted";

export const TREE_ROW_HEIGHT_PX = 32;

export function useInkcapTreeModel({
  app,
  rootPath,
  rootLabel = "Computer",
  activePath,
  onOpenFile,
  onSelectPath,
  rowHeight = TREE_ROW_HEIGHT_PX,
}: {
  app: AppRoot;
  rowHeight?: number;
  rootPath: string;
  /** The Computer or workspace's real name, shown on the Explorer root row. */
  rootLabel?: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onSelectPath?: (path: string) => void;
}) {
  const { scope, snapshot, focusedPath, requestPage, reload } =
    useComputerTreePages({ app, rootPath, activePath });
  const callbacks = useRef({ activePath, onOpenFile, onSelectPath, rootLabel });
  callbacks.current = { activePath, onOpenFile, onSelectPath, rootLabel };
  // Pierre owns a long-lived model; its event handler delegates to the current scope.
  const loadDirectory = useRef(requestPage);
  loadDirectory.current = requestPage;
  const { model } = useFileTree({
    paths: [],
    itemHeight: rowHeight,
    initialExpansion: 2,
    flattenEmptyDirectories: false,
    composition: { contextMenu: { enabled: true } },
    // Pierre's FileTree model is constructed once; read the live root label
    // through the same ref the selection handler uses to avoid a stale close.
    renderRowDecoration: ({ row }) =>
      row.path === "/" ? { text: callbacks.current.rootLabel } : null,
    unsafeCSS:
      '[data-item-section="content"] { display: flex; align-items: center; }' +
      '[data-item-path="/"] [data-item-section="decoration"] { justify-content: flex-start; color: inherit; }',
    onSelectionChange(selected) {
      const path = selected[0];
      if (!path) return;
      callbacks.current.onSelectPath?.(path);
      if (path.endsWith("/")) loadDirectory.current(path, 0);
      // Revealing an already active tab must not create another navigation.
      else if (path !== callbacks.current.activePath)
        callbacks.current.onOpenFile(path);
    },
  });
  const treeState = useRef(createComputerTreeSyncState());
  const revealed = useRef<string | null>(null);
  useLayoutEffect(() => {
    resetComputerTree(model, treeState.current);
    revealed.current = null;
  }, [model, scope]);
  useLayoutEffect(() => {
    revealed.current = null;
    for (const path of model.getSelectedPaths()) {
      if (!path.endsWith("/") && path !== activePath)
        model.getItem(path)?.deselect();
    }
  }, [activePath, model]);
  useLayoutEffect(() => {
    if (snapshot.listings.length === 0) revealed.current = null;
    syncComputerTree(model, snapshot.listings, treeState.current);
    if (!activePath || revealed.current === activePath) return;
    const ancestors = revealParents(activePath, rootPath);
    if (!ancestors.every((parent) => treeState.current.known.has(parent)))
      return;
    for (const parent of ancestors) {
      const directory = model.getItem(parent);
      if (directory && "expand" in directory) directory.expand();
    }
    const item = model.getItem(activePath);
    if (item) {
      revealed.current = activePath;
      item.select();
      model.scrollToPath(activePath, { focus: false });
    }
  }, [activePath, model, rootPath, scope, snapshot.listings]);
  useEffect(() => {
    if (snapshot.failure)
      console.error(
        "Inkcap directory listing failed",
        Redacted.make(snapshot.failure),
      );
  }, [snapshot.failure]);
  const latest = snapshot.listings
    .filter(({ request }) => request.path === focusedPath)
    .sort((left, right) => left.request.offset - right.request.offset)
    .at(-1)?.listing;
  const page = {
    path: latest?.path ?? focusedPath,
    next: latest?.nextOffset ?? null,
  };
  // The root directory was listed in full and holds nothing yet.
  const rootEmpty = snapshot.listings.some(
    ({ request, listing }) =>
      request.path === rootPath &&
      request.offset === 0 &&
      listing.entries.length === 0 &&
      listing.nextOffset === null,
  );
  const reloadRoot = reload;
  /**
   * Show an entry this window just created, by the same rule the listing
   * applies, then re-read the listing so the root's empty note and every
   * page agree with the Computer.
   */
  const noteCreated = (path: string) => {
    const name = path.split("/").filter(Boolean).at(-1) ?? "";
    if (!isHiddenEntry({ name, type: "" }) && !model.getItem(path))
      model.batch([{ type: "add", path }]);
    reloadRoot();
  };
  const loadNext = () => {
    if (page.next !== null) requestPage(page.path, page.next);
  };
  return {
    model,
    page,
    error: snapshot.failure
      ? `${describeAppError(snapshot.failure).message} Your open files remain available.`
      : "",
    busy: snapshot.busy,
    rootEmpty,
    reloadRoot,
    noteCreated,
    loadNext,
  };
}
