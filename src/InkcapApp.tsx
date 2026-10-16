import { documentIdentitySchema } from "./document-activity-contract.js";
import * as Redacted from "effect/Redacted";
import { recordDocumentActivity } from "./document-activity.js";
import {
  useAppContext,
  useComputerId,
  useHostNavigation,
} from "@fungi.computer/agar/react";
import { queryKeys } from "@fungi.computer/agar/query";
import { useQueryClient } from "@tanstack/react-query";
import type { AppRoot } from "@fungi.computer/agar";
import { AppError } from "@fungi.computer/agar/errors";
import { readFilesLocation } from "@fungi.computer/agar/roles/files";
import {
  computerList,
  type ComputerFileReplacementInput,
  replaceComputerFileIfUnchanged,
  writeComputerFile,
} from "@fungi.computer/agar/computer";
import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import { emptyTabHistory, tabHistory } from "./tab-history.js";
import { useInkcapCommands } from "./commands.js";
import type { InkcapOpenFileInput, InkcapSaveBinding } from "./commands.js";
import { readOpenedFile } from "./open-file.js";
import type { OpenTarget } from "./read-for-open.js";
import { InkcapView, type InkcapViewModel } from "./InkcapView.js";
import type { OpenedFile } from "./open-file.js";
import type { InkcapFileSource } from "./file-source.js";

export type InkcapContext = {
  computerId: string | null;
  computerName: string | null;
  projectPath: string;
};
export type Connection = {
  app: AppRoot;
  source?: InkcapFileSource;
};
export type InkcapFileOperations = Readonly<{
  read: (
    app: AppRoot,
    path: string,
    signal: AbortSignal,
    target?: OpenTarget,
  ) => Promise<OpenedFile>;
  replace: (
    app: AppRoot,
    input: ComputerFileReplacementInput,
    signal: AbortSignal,
  ) => Promise<void>;
  write: (
    app: AppRoot,
    path: string,
    contents: string,
    signal: AbortSignal,
  ) => Promise<void>;
}>;
export type Tab = {
  tabKey: number;
  path: string;
  initial: string;
  dirty: boolean;
  target: OpenTarget & { dirty: boolean; saving: boolean };
  connection: Connection | null;
  computerId: string | null;
  previewUrl?: string;
  previewKind?: "image" | "video";
};
const defaultContext: InkcapContext = {
  computerId: null,
  computerName: null,
  projectPath: "/",
};

const liveFileOperations: InkcapFileOperations = {
  read: (app, path, signal, target) =>
    readOpenedFile(app, path, signal, target),
  replace: async (app, input, signal) => {
    await replaceComputerFileIfUnchanged(app.capabilities, input, { signal });
  },
  write: async (app, path, contents, signal) => {
    await writeComputerFile(
      app.capabilities,
      {
        path,
        content: new Blob([contents], { type: "text/plain;charset=utf-8" }),
      },
      { signal },
    );
  },
};

function isConnectionUsable(connection: Connection): boolean {
  const state = connection.app.lifecycle.get();
  return (
    state !== "disposing" && state !== "disposed" && state !== "disconnected"
  );
}

function canApplyRead(
  signal: AbortSignal,
  selected: Connection,
  replaceKey: number | undefined,
  current: Connection | null,
  computerId: string | null,
): boolean {
  return (
    !signal.aborted &&
    isConnectionUsable(selected) &&
    (selected.source?.kind === "repository" ||
      selected.app.context.get().computerId === computerId) &&
    (replaceKey !== undefined || current === selected)
  );
}

function selectOpenTarget(
  path: string,
  replaceKey: number | undefined,
  tabs: readonly Tab[],
  current: Connection | null,
): {
  selected: Connection;
  replacement: Tab | undefined;
  existing: Tab | undefined;
} | null {
  const replacement =
    replaceKey === undefined
      ? undefined
      : tabs.find((tab) => tab.tabKey === replaceKey);
  const selected = replacement?.connection ?? current;
  if (!selected || !isConnectionUsable(selected)) return null;
  const computerId =
    selected.source?.kind === "repository"
      ? null
      : selected.app.context.get().computerId;
  if (
    replacement &&
    selected.source?.kind !== "repository" &&
    replacement.computerId !== computerId
  )
    return null;
  const existing = tabs.find(
    (tab) =>
      tab.path === path &&
      tab.connection === selected &&
      tab.computerId === computerId,
  );
  if (replaceKey !== undefined && !replacement) return null;
  return { selected, replacement, existing };
}

function applyOpenedFile(
  result: OpenedFile,
  path: string,
  selected: Connection,
  replacement: Tab | undefined,
  revision: number | undefined,
  replaceKey: number | undefined,
  setError: (message: string) => void,
  removeReplacement: (tab: Tab | undefined, key: number) => void,
  add: (
    path: string,
    initial: string,
    connection: Connection,
    previewUrl?: string,
    previewKind?: "image" | "video",
  ) => void,
): void {
  const error = openedFileError(result, path, replacement, revision);
  if (error) {
    setError(error);
    return;
  }
  if (replaceKey !== undefined) removeReplacement(replacement, replaceKey);
  setError("");
  if (result.kind === "image" || result.kind === "video")
    add(path, "", selected, URL.createObjectURL(result.blob), result.kind);
  if (result.kind === "text") add(path, result.contents, selected);
}

function openedFileError(
  result: OpenedFile,
  path: string,
  replacement: Tab | undefined,
  revision: number | undefined,
): string | undefined {
  if (result.kind === "changed" || result.kind === "closed") {
    return result.kind === "changed"
      ? "Reopen cancelled because this tab changed during the read. Your edits remain open."
      : "Reopen cancelled because this tab was closed.";
  }
  const replacementChanged =
    replacement !== undefined && replacement.target.revision !== revision;
  if (replacement?.target.closed || replacementChanged) {
    return replacementChanged
      ? "Reopen cancelled because this tab changed during the read. Your edits remain open."
      : "Reopen cancelled because this tab was closed.";
  }
  if (result.kind === "invalid-text") {
    return `The file ${path} is not valid UTF-8 text. Existing edits remain open.`;
  }
  return undefined;
}

export function useInkcapWorkbench({
  connection,
  context = defaultContext,
  files = liveFileOperations,
}: {
  connection: Connection | null;
  context?: InkcapContext;
  files?: InkcapFileOperations;
}) {
  const queryClient = useQueryClient();
  function sourceFor(selected: Connection): InkcapFileSource {
    return (
      selected.source ?? {
        kind: "computer",
        id: selected.app.context.get().computerId ?? "",
        label: "Computer",
        read: (path, signal, target) =>
          files.read(selected.app, path, signal, target),
        replace: (path, content, expectedContent, signal) =>
          files.replace(
            selected.app,
            { path, content, expectedContent },
            signal,
          ),
        write: (path, contents, signal) =>
          files.write(selected.app, path, contents, signal),
      }
    );
  }
  const computerId = useComputerId(connection?.app);
  const openRequest = useAppContext(connection?.app)?.openRequest;
  const receivedRequests = useRef(new Set<string>());
  const selectedContext = connection
    ? {
        ...context,
        computerId,
        computerName:
          context.computerId === computerId ? context.computerName : null,
      }
    : context;
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [history, navigate] = useReducer(tabHistory, emptyTabHistory);
  const active = history.entries[history.index] ?? null;
  const goBack = useCallback(() => {
    if (history.index <= 0) return false;
    navigate({ type: "back" });
    return true;
  }, [history.index]);
  useHostNavigation(connection?.app.window.navigation, {
    canGoBack: history.index > 0,
    onBack: goBack,
  });
  const activate = useCallback((key: number) => {
    navigate({ type: "visit", key });
  }, []);
  const [closing, setClosing] = useState<number | null>(null);
  const [windowClosing, setWindowClosing] = useState(false);
  const [windowCloseSaving, setWindowCloseSaving] = useState(false);
  const [error, setError] = useState("");
  const [downloadedFile, setDownloadedFile] = useState<{
    tabKey: number;
    name: string;
  } | null>(null);
  const [activityNotice, setActivityNotice] = useState<{
    computerId: string;
    path: string;
  } | null>(null);
  const tabsRef = useRef<Tab[]>([]);
  const sequence = useRef(0);
  const reads = useRef(new Set<AbortController>());
  const opening = useRef(new Set<string>());
  const current = useRef(connection);
  const activeRef = useRef<number | null>(null);
  const saveBindings = useRef(new Map<number, InkcapSaveBinding>());
  const openFileRef = useRef<(input: InkcapOpenFileInput) => Promise<void>>(
    () =>
      Promise.reject(
        new Error("Inkcap is not ready to open a handed-off file."),
      ),
  );
  const windowClosePending = useRef<{
    promise: Promise<boolean>;
    resolve: (accepted: boolean) => void;
  } | null>(null);
  activeRef.current = active;

  useEffect(() => {
    current.current = connection;
    setActivityNotice(null);
    const unsubscribe = connection?.app.lifecycle.subscribe((state) => {
      if (
        state === "disposing" ||
        state === "disposed" ||
        state === "disconnected"
      ) {
        if (current.current === connection) current.current = null;
      }
    });
    return () => unsubscribe?.();
  }, [connection, computerId]);

  useEffect(
    () => () => {
      windowClosePending.current?.resolve(false);
      windowClosePending.current = null;
      current.current = null;
      saveBindings.current.clear();
      for (const reader of reads.current) reader.abort();
      reads.current.clear();
    },
    [],
  );

  tabsRef.current = tabs;
  useEffect(
    () => () => {
      for (const tab of tabsRef.current)
        if (tab.previewUrl) URL.revokeObjectURL(tab.previewUrl);
    },
    [],
  );

  const add = useCallback(
    (
      path: string,
      initial: string,
      selected: Connection | null,
      previewUrl?: string,
      previewKind?: "image" | "video",
      focus = true,
    ) => {
      const tabKey = ++sequence.current;
      const computerId =
        selected?.source?.kind === "repository"
          ? null
          : (selected?.app.context.get().computerId ?? null);
      setTabs((existing) => [
        ...existing,
        {
          tabKey,
          path,
          initial,
          connection: selected,
          computerId,
          previewUrl,
          previewKind,
          dirty: false,
          target: { revision: 0, closed: false, dirty: false, saving: false },
        },
      ]);
      if (focus) activate(tabKey);
    },
    [activate],
  );
  const newDraft = useCallback(() => {
    add(`Untitled ${String(sequence.current + 1)}`, "", null);
  }, [add]);
  const focusedSave = useCallback(() => {
    const tabKey = activeRef.current;
    return tabKey === null ? undefined : saveBindings.current.get(tabKey);
  }, []);
  useInkcapCommands(connection?.app ?? null, {
    newDraft,
    save: focusedSave,
    openFile: (input) => openFileRef.current(input),
  });
  function revoke(tab: Tab): void {
    if (tab.previewUrl) URL.revokeObjectURL(tab.previewUrl);
  }
  function removeReplacement(replacement: Tab | undefined, tabKey: number) {
    if (!replacement) return;
    replacement.target.closed = true;
    revoke(replacement);
    setTabs((items) => items.filter((item) => item.tabKey !== tabKey));
    navigate({ type: "remove", key: tabKey });
  }

  async function recordActivity(
    selected: Connection,
    intendedComputer: string | null,
    path: string,
    activity: "opened" | "edited",
  ) {
    if (selected.source?.kind === "repository" || intendedComputer === null)
      return;
    const recorded = await recordDocumentActivity(
      selected.app,
      intendedComputer,
      path,
      activity,
    );
    if (
      current.current === selected &&
      selected.app.context.get().computerId === intendedComputer &&
      isConnectionUsable(selected)
    )
      setActivityNotice(
        recorded ? null : { computerId: intendedComputer, path },
      );
  }

  async function open(path: string, replaceKey?: number, background = false) {
    const target = selectOpenTarget(path, replaceKey, tabs, current.current);
    if (!target) return;
    const { selected, replacement, existing } = target;
    const selectedComputer =
      selected.source?.kind === "repository"
        ? null
        : selected.app.context.get().computerId;
    if (existing && replaceKey === undefined) {
      activate(existing.tabKey);
      return;
    }
    if (replaceKey !== undefined && !replacement) return;
    const openKey = `${selected.app.identity.surfaceId}:${selected.source?.id ?? selectedComputer ?? ""}:${path}`;
    if (opening.current.has(openKey)) return;
    const revision = replacement?.target.revision;
    opening.current.add(openKey);
    const controller = new AbortController();
    reads.current.add(controller);
    try {
      const result = await sourceFor(selected).read(
        path,
        controller.signal,
        replacement?.target,
      );
      if (
        !canApplyRead(
          controller.signal,
          selected,
          replaceKey,
          current.current,
          selectedComputer,
        )
      )
        return;
      const applied = !openedFileError(result, path, replacement, revision);
      applyOpenedFile(
        result,
        path,
        selected,
        replacement,
        revision,
        replaceKey,
        setError,
        removeReplacement,
        (path, initial, selected, previewUrl, previewKind) => {
          add(
            path,
            initial,
            selected,
            previewUrl,
            previewKind,
            !background || activeRef.current === replaceKey,
          );
        },
      );
      if (!background && applied)
        await recordActivity(selected, selectedComputer, path, "opened");
    } catch (cause) {
      console.error("Inkcap file read failed", cause);

      if (!controller.signal.aborted)
        setError(
          cause instanceof AppError && cause.code === "FILE_TOO_LARGE"
            ? selected.source?.kind === "repository"
              ? "This repository file is too large to edit in Inkcap. Choose a smaller file. Existing edits remain open."
              : "This file is too large to preview in Inkcap. Choose a smaller file. Existing edits remain open."
            : `Could not read ${path}. Access may be denied or ${selected.source?.label ?? "the Computer"} unavailable. Existing edits remain open.`,
        );
    } finally {
      reads.current.delete(controller);
      opening.current.delete(openKey);
    }
  }

  openFileRef.current = async ({ computerId, path }) => {
    if (current.current?.source?.kind === "repository")
      throw new Error("Open Computer file handoffs in the Computer source.");
    if (current.current?.app.context.get().computerId !== computerId)
      throw new Error(
        "The handed-off file belongs to a different admitted Computer.",
      );
    await open(path);
  };

  function close(tabKey: number, discard = false): void {
    const tab = tabs.find((item) => item.tabKey === tabKey);
    if (!tab) return;
    if (tab.target.saving) {
      setError(
        "Wait for this save to finish before closing. Your edits remain open.",
      );
      return;
    }
    if (tab.target.dirty && !discard) {
      setClosing(tabKey);
      setError("");
      return;
    }
    tab.target.closed = true;
    revoke(tab);
    setClosing((request) => (request === tabKey ? null : request));
    setTabs((items) => items.filter((item) => item.tabKey !== tabKey));
    navigate({ type: "remove", key: tabKey });
  }

  useEffect(() => {
    if (!connection || openRequest?.kind !== "navigate") return;
    const location = readFilesLocation(openRequest.params);
    // Repository locations open in the repository editor (InkcapEntry).
    if (location === null || "repository" in location) return;
    const requestKey = JSON.stringify([
      connection.app.identity.surfaceId,
      openRequest.requestId,
    ]);
    if (receivedRequests.current.has(requestKey)) return;
    receivedRequests.current.add(requestKey);
    if (receivedRequests.current.size > 64) {
      const oldest = receivedRequests.current.values().next().value;
      if (oldest !== undefined) receivedRequests.current.delete(oldest);
    }
    const target = documentIdentitySchema.safeParse({
      computerId,
      path: location.path,
    });
    if (!target.success || connection.source?.kind === "repository") {
      setError(
        "This Recent File is unavailable on the current Computer source.",
      );
      return;
    }
    let active = true;
    void openFileRef.current(target.data).catch((cause: unknown) => {
      console.error(
        "Inkcap Recent File could not be opened",
        Redacted.make(cause),
      );
      if (active && current.current === connection)
        setError(
          "This Recent File could not be opened. Your existing documents remain open.",
        );
    });
    return () => {
      active = false;
    };
  }, [connection, computerId, openRequest]);

  async function withSource<T>(
    selected: Connection,
    intendedComputer: string | null,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!isConnectionUsable(selected))
      throw new Error(`${selected.source?.label ?? "Computer"} disconnected`);
    if (
      selected.source?.kind !== "repository" &&
      (intendedComputer === null ||
        selected.app.context.get().computerId !== intendedComputer)
    ) {
      const message =
        "Select this file's original Computer before saving or reloading. Your edits remain open.";
      setError(message);
      throw new Error(message);
    }
    const controller = new AbortController();
    reads.current.add(controller);
    try {
      return await operation(controller.signal);
    } finally {
      reads.current.delete(controller);
    }
  }

  function write(
    selected: Connection,
    intendedComputer: string | null,
    path: string,
    contents: string,
  ): Promise<void> {
    return withSource(selected, intendedComputer, async (signal) => {
      await sourceFor(selected).write(path, contents, signal);
      await recordActivity(selected, intendedComputer, path, "edited");
    });
  }

  async function download(
    tab: Tab,
    path: string,
    contents: string,
  ): Promise<void> {
    const app = current.current?.app;
    if (!app) throw new Error("Download requires a connected App host.");
    const leaf = path.split("/").at(-1) ?? path;
    const name = /\.[^.]+$/.test(leaf) ? leaf : `${leaf}.txt`;
    const outcome = await app.ui.requestBrowserAction({
      kind: "saveFile",
      name,
      mime: "text/plain;charset=utf-8",
      bytes: new TextEncoder().encode(contents),
    });
    if (outcome.kind === "refused")
      throw new Error(`Download refused: ${outcome.reason}`);
    if (outcome.kind !== "saved")
      throw new Error("The App host did not accept this download.");
    setDownloadedFile({ tabKey: tab.tabKey, name });
  }

  function reopen(tab: Tab, options: { background?: boolean } = {}): void {
    const selected = tab.connection;
    if (!selected) return;
    if (tab.target.saving) {
      setError("Wait for this save to finish before reopening.");
      return;
    }
    if (tab.target.dirty) {
      setError("Save your edits before reopening this file.");
      return;
    }
    if (!isConnectionUsable(selected)) {
      setError("Computer disconnected. Existing edits remain open.");
      return;
    }
    if (
      selected.source?.kind !== "repository" &&
      selected.app.context.get().computerId !== tab.computerId
    ) {
      setError(
        "Select this file's original Computer before reopening. Existing edits remain open.",
      );
      return;
    }
    void open(tab.path, tab.tabKey, options.background);
  }

  const selectedConnection = connection;
  const canList =
    selectedConnection?.app.capabilities.has(computerList) ?? false;
  const onSaveBinding = useCallback(
    (tabKey: number, binding: InkcapSaveBinding | undefined) => {
      if (binding) saveBindings.current.set(tabKey, binding);
      else saveBindings.current.delete(tabKey);
    },
    [],
  );
  const finishWindowClose = useCallback((accepted: boolean) => {
    const pending = windowClosePending.current;
    windowClosePending.current = null;
    setWindowClosing(false);
    setWindowCloseSaving(false);
    pending?.resolve(accepted);
  }, []);
  const requestWindowClose = useCallback((): Promise<boolean> => {
    const pending = windowClosePending.current;
    if (pending) return pending.promise;
    if (!tabsRef.current.some((tab) => tab.target.dirty))
      return Promise.resolve(true);
    if (tabsRef.current.some((tab) => tab.target.saving)) {
      setError("Wait for the current save to finish before closing Inkcap.");
      return Promise.resolve(false);
    }
    let resolve!: (accepted: boolean) => void;
    const promise = new Promise<boolean>((complete) => {
      resolve = complete;
    });
    windowClosePending.current = { promise, resolve };
    setError("");
    setWindowClosing(true);
    return promise;
  }, []);
  const saveAndCloseWindow = useCallback(async (): Promise<void> => {
    if (!windowClosePending.current || windowCloseSaving) return;
    setWindowCloseSaving(true);
    try {
      for (const tab of tabsRef.current.filter((item) => item.target.dirty)) {
        const binding = saveBindings.current.get(tab.tabKey);
        if (!binding)
          throw new Error("A dirty document is unavailable to save.");
        await binding.save();
        if (tab.target.dirty)
          throw new Error("A dirty document could not be saved.");
      }
      finishWindowClose(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message} Inkcap remains open.`
          : "A document could not be saved. Inkcap remains open.",
      );
      setWindowCloseSaving(false);
    }
  }, [finishWindowClose, windowCloseSaving]);
  return {
    connection,
    selectedConnection,
    canList,
    context: selectedContext,
    error,
    downloadedFile,
    activityNotice,
    onDismissActivityNotice: () => {
      setActivityNotice(null);
    },
    tabs,
    active,
    closing,
    windowClosing,
    windowCloseSaving,
    requestWindowClose,
    onSaveWindowClose: () => {
      void saveAndCloseWindow();
    },
    onDiscardWindowClose: () => {
      finishWindowClose(true);
    },
    onCancelWindowClose: () => {
      finishWindowClose(false);
    },
    onNewDraft: newDraft,
    onChooseComputer: () => {
      const app = current.current?.app;
      if (!app) {
        setError("The Computer picker requires a connected App host.");
        return;
      }
      void app.ui.requestComputerChoice().catch((cause: unknown) => {
        console.error("Inkcap Computer choice failed", Redacted.make(cause));
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't open the Computer picker.",
        );
      });
    },
    onOpenFile: (path) => {
      void open(path);
    },
    onActivate: activate,
    onClose: (tabKey) => {
      close(tabKey);
    },
    onSaveClose: (tabKey) => {
      const binding = saveBindings.current.get(tabKey);
      if (!binding) {
        setError("This document is no longer available to save.");
        return;
      }
      void binding.save().catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't save. Your document remains open.",
        );
      });
    },
    onDiscardClose: (tabKey) => {
      close(tabKey, true);
    },
    onCancelClose: () => {
      setClosing(null);
    },
    onReopen: reopen,
    onSaveAs: async (tab, nextPath, contents) => {
      const selected = tab.connection ?? current.current;
      if (
        !selected ||
        (selected.source?.kind !== "repository" &&
          selected.app.context.get().computerId === null)
      ) {
        await download(tab, nextPath, contents);
        return;
      }
      const intendedComputer =
        selected.source?.kind === "repository"
          ? null
          : tab.connection
            ? tab.computerId
            : selected.app.context.get().computerId;
      const treeKey = queryKeys.of(selected.app, "tree");
      await write(selected, intendedComputer, nextPath, contents);
      void queryClient.invalidateQueries({ queryKey: treeKey });
      if (!tab.connection)
        setTabs((items) =>
          items.map((item) =>
            item.tabKey === tab.tabKey
              ? { ...item, connection: selected, computerId: intendedComputer }
              : item,
          ),
        );
    },
    onPathChange: (tab, nextPath) => {
      setTabs((items) =>
        items.map((item) =>
          item.tabKey === tab.tabKey ? { ...item, path: nextPath } : item,
        ),
      );
    },
    onStatus: (tab, dirty, saving) => {
      if (dirty)
        setDownloadedFile((current) =>
          current?.tabKey === tab.tabKey ? null : current,
        );
      setTabs((items) =>
        items.map((item) =>
          item.tabKey === tab.tabKey ? { ...item, dirty } : item,
        ),
      );
      if (closing === tab.tabKey && !dirty && !saving) close(tab.tabKey);
    },
    onSaveBinding,
    onWrite: async (tab, contents, expectedContent) => {
      const selected = tab.connection;
      if (!selected) {
        await download(tab, tab.path, contents);
        return;
      }
      await withSource(selected, tab.computerId, async (signal) => {
        await sourceFor(selected).replace(
          tab.path,
          contents,
          expectedContent,
          signal,
        );
        await recordActivity(selected, tab.computerId, tab.path, "edited");
      });
    },
    onOverwrite: async (tab, contents) => {
      if (!tab.connection) {
        await download(tab, tab.path, contents);
        return;
      }
      await write(tab.connection, tab.computerId, tab.path, contents);
    },
    onReadCurrent: async (tab) => {
      const selected = tab.connection;
      if (!selected || tab.target.closed)
        throw new Error(
          `File is no longer open on ${selected?.source?.label ?? "a Computer"}`,
        );
      return withSource(selected, tab.computerId, async (signal) => {
        const result = await sourceFor(selected).read(tab.path, signal);
        if (
          signal.aborted ||
          tab.target.closed ||
          !isConnectionUsable(selected) ||
          (selected.source?.kind !== "repository" &&
            selected.app.context.get().computerId !== tab.computerId)
        ) {
          throw new Error(
            `The original ${selected.source?.label ?? "Computer"} is no longer available`,
          );
        }
        if (result.kind !== "text")
          throw new Error(
            `The ${selected.source?.label ?? "Computer"} file could not be read as text`,
          );
        return result.contents;
      });
    },
  } satisfies InkcapViewModel;
}

/** What a host that may swap this editor for another needs: the same
 * save/discard/cancel consultation the App window close already uses. */
export type InkcapEditorHandle = Readonly<{
  requestWindowClose: () => Promise<boolean>;
}>;

export function InkcapApp({
  connection,
  context = defaultContext,
  onReady,
}: {
  connection: Connection | null;
  context?: InkcapContext;
  onReady?: (handle: InkcapEditorHandle) => void;
}): React.JSX.Element {
  const model = useInkcapWorkbench({ connection, context });
  useEffect(() => {
    if (!connection) return;
    return connection.app.window.onBeforeClose(model.requestWindowClose);
  }, [connection, model.requestWindowClose]);
  useEffect(() => {
    onReady?.({ requestWindowClose: model.requestWindowClose });
  }, [onReady, model.requestWindowClose]);
  return <InkcapView model={model} />;
}
