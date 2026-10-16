import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useFileTree } from "@pierre/trees/react";
import { FileTree, type FileTreeBatchOperation } from "@pierre/trees";
import type { AppRoot } from "@fungi.computer/agar";
import { useComputerId } from "@fungi.computer/agar/react";
import { capabilityQuery, queryKeys } from "@fungi.computer/agar/query";
import * as Redacted from "effect/Redacted";
import {
  computerList,
  type ComputerListing,
} from "@fungi.computer/agar/computer";

export const TREE_ROW_HEIGHT_PX = 32;

function entryPath(directory: string, name: string, type: string): string {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  return `${prefix}${name}${type === "directory" ? "/" : ""}`;
}

/** Merge one server listing into the native model without repeating paths. */
export function mergeListing(
  model: Pick<FileTree, "batch">,
  result: ComputerListing,
  knownPaths: Set<string>,
): readonly string[] {
  const paths = result.entries
    .filter((entry) => entry.type !== "symlink")
    .map((entry) => entryPath(result.path, entry.name, entry.type));
  const additions = paths.filter((path) => !knownPaths.has(path));
  if (additions.length > 0) {
    const operations: FileTreeBatchOperation[] = additions.map((path) => ({
      type: "add",
      path,
    }));
    model.batch(operations);
  }
  knownPaths.add(result.path);
  for (const path of paths) knownPaths.add(path);
  return additions;
}

export function revealParents(
  path: string,
  rootPath: string,
): readonly string[] {
  const root = rootPath === "/" ? "/" : rootPath.replace(/\/+$/, "");
  if (root !== "/" && path !== root && !path.startsWith(`${root}/`)) return [];
  const relative =
    root === "/"
      ? path.split("/").filter(Boolean)
      : path.slice(root.length).split("/").filter(Boolean);
  const parents = [root];
  let parent = root;
  for (const segment of relative.slice(0, -1)) {
    parent = `${parent === "/" ? "" : parent}/${segment}`;
    parents.push(parent);
  }
  return parents;
}

type PageRequest = Readonly<{ path: string; offset: number }>;

export function useInkcapTreeModel({
  app,
  rootPath,
  rootLabel = "Computer",
  activePath,
  onOpenFile,
  onSelectPath,
}: {
  app: AppRoot;
  rootPath: string;
  /** The Computer or workspace's real name, shown on the Explorer root row. */
  rootLabel?: string;
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onSelectPath?: (path: string) => void;
}) {
  const client = useQueryClient();
  const computerId = useComputerId(app);
  const subscribe = useCallback(
    (listener: () => void) => app.capabilities.subscribe(listener),
    [app],
  );
  const getVersion = useCallback(() => app.capabilities.version, [app]);
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);
  const scope = useMemo(
    () => ({ app, rootPath, computerId, version }),
    [app, rootPath, computerId, version],
  );
  const [selection, setSelection] = useState<{
    scope: typeof scope;
    activePath: string | null;
    path: string;
    pages: readonly PageRequest[];
  } | null>(null);
  const current = selection?.scope === scope ? selection : null;
  const parents = activePath ? revealParents(activePath, rootPath) : [];
  const focusedPath =
    current?.activePath === activePath
      ? current.path
      : (parents.at(-1) ?? rootPath);
  const requests = new Map<string, PageRequest>();
  for (const path of [rootPath, ...parents])
    requests.set(`${path}:0`, { path, offset: 0 });
  for (const request of current?.pages ?? [])
    requests.set(`${request.path}:${String(request.offset)}`, request);
  const pages = [...requests.values()];
  const key = (path: string, offset: number) =>
    queryKeys.of(app, "tree", version, path, offset);
  const snapshot = useQueries({
    queries: pages.map(({ path, offset }) =>
      capabilityQuery(
        app,
        computerList,
        key(path, offset),
        async (handle, signal) => {
          const result = await handle.list({ path, offset, limit: 256 });
          signal.throwIfAborted();
          return result;
        },
      ),
    ),
    combine: (results) => ({
      listings: results.flatMap((result, index) =>
        result.data ? [{ request: pages[index], listing: result.data }] : [],
      ),
      busy: results.some((result) => result.isFetching),
      failure: results.find((result) => result.error)?.error ?? null,
    }),
  });
  const callbacks = useRef({ activePath, onOpenFile, onSelectPath, rootLabel });
  callbacks.current = { activePath, onOpenFile, onSelectPath, rootLabel };
  const requestPage = (path: string, offset: number) => {
    const directory = path.replace(/\/+$/, "") || "/";
    const pageKey = key(directory, offset);
    if (client.getQueryState(pageKey)?.status === "error") {
      void client.invalidateQueries({ queryKey: pageKey, exact: true });
    }
    setSelection((previous) => ({
      scope,
      activePath,
      path: directory,
      pages: [
        ...(previous?.scope === scope
          ? previous.pages.filter(
              (page) => page.path !== directory || page.offset !== offset,
            )
          : []),
        { path: directory, offset },
      ],
    }));
  };
  // Pierre owns a long-lived model; its event handler delegates to the current scope.
  const loadDirectory = useRef(requestPage);
  loadDirectory.current = requestPage;
  const { model } = useFileTree({
    paths: [],
    itemHeight: TREE_ROW_HEIGHT_PX,
    initialExpansion: 1,
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
  const knownPaths = useRef(new Set<string>());
  const projectedPages = useRef(new Map<string, readonly string[]>());
  const revealed = useRef<string | null>(null);
  useLayoutEffect(() => {
    knownPaths.current.clear();
    projectedPages.current.clear();
    model.resetPaths([]);
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
    if (snapshot.listings.length === 0) {
      knownPaths.current.clear();
      projectedPages.current.clear();
      model.resetPaths([]);
      revealed.current = null;
    }
    for (const { request, listing } of snapshot.listings) {
      const pageKey = `${request.path}:${String(request.offset)}`;
      const paths = listing.entries
        .filter((entry) => entry.type !== "symlink")
        .map((entry) => entryPath(listing.path, entry.name, entry.type));
      const previous = projectedPages.current.get(pageKey) ?? [];
      projectedPages.current.set(pageKey, paths);
      const retained = new Set([...projectedPages.current.values()].flat());
      for (const path of previous) {
        if (retained.has(path)) continue;
        if (model.getItem(path)) model.remove(path, { recursive: true });
        for (const known of knownPaths.current) {
          if (known === path || (path.endsWith("/") && known.startsWith(path)))
            knownPaths.current.delete(known);
        }
      }
      mergeListing(model, listing, knownPaths.current);
    }
    if (!activePath || revealed.current === activePath) return;
    const ancestors = revealParents(activePath, rootPath);
    if (!ancestors.every((parent) => knownPaths.current.has(parent))) return;
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
  const reloadRoot = () => {
    void client.invalidateQueries({
      queryKey: queryKeys.of(app, "tree", version),
    });
  };
  const loadNext = () => {
    if (page.next !== null) requestPage(page.path, page.next);
  };
  return {
    model,
    page,
    error: snapshot.failure
      ? "Could not list this directory. Existing files remain available."
      : "",
    busy: snapshot.busy,
    reloadRoot,
    loadNext,
  };
}
