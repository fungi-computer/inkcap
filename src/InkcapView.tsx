import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { FileCode2, FilePlus2, FolderOpen, PanelLeft, X } from "lucide-react";
import { Button } from "@fungi.computer/caps/components/button";
import { EmptyState } from "@fungi.computer/caps/blocks/empty-state";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@fungi.computer/caps/components/tabs";
import { Keycap } from "@fungi.computer/caps/components/keycap";
import { IconButton } from "@fungi.computer/caps/components/icon-button";
import { Alert } from "@fungi.computer/caps/components/alert";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@fungi.computer/caps/components/dialog";
import { useWindowStatus } from "@fungi.computer/agar/react";
import { directoryForTreePath, resolveComputerPath } from "./tree-path.js";
import { repositoryFilePath } from "@fungi.computer/agar/roles/files";
import type { FileSaveResult } from "@fungi.computer/agar/roles/files";
import type { InkcapSaveBinding } from "./commands.js";
import type { Connection, InkcapContext, Tab } from "./InkcapApp.js";

const FileTab = lazy(async () => {
  const module = await import("./FileTab.js");
  return { default: module.FileTab };
});

const InkcapFileTree = lazy(async () => {
  const module = await import("./InkcapFileTree.js");
  return { default: module.InkcapFileTree };
});

export type InkcapViewModel = {
  fileTree?: (onOpenFile: (path: string) => void) => React.ReactNode;
  sourceLabel?: string;
  connection: Connection | null;
  selectedConnection: Connection | null;
  canList: boolean;
  context: InkcapContext;
  error: string;
  downloadedFile: { tabKey: number; name: string } | null;
  repositoryStatus?: string;
  repositoryStates?: ReadonlyMap<string, FileSaveResult>;
  activityNotice?: { computerId: string; path: string } | null;
  onDismissActivityNotice?: () => void;
  tabs: Tab[];
  active: number | null;
  closing: number | null;
  windowClosing: boolean;
  windowCloseSaving: boolean;
  requestWindowClose: () => Promise<boolean>;
  onSaveWindowClose: () => void;
  onDiscardWindowClose: () => void;
  onCancelWindowClose: () => void;
  onNewDraft: () => void;
  onChooseComputer: () => void;
  onOpenFile: (path: string) => void;
  onActivate: (tabKey: number) => void;
  onClose: (tabKey: number) => void;
  onSaveClose: (tabKey: number) => void;
  onDiscardClose: (tabKey: number) => void;
  onCancelClose: () => void;
  onReopen: (tab: Tab) => void;
  onSaveAs: (tab: Tab, path: string, contents: string) => Promise<void>;
  onPathChange: (tab: Tab, path: string) => void;
  onStatus: (tab: Tab, dirty: boolean, saving: boolean) => void;
  onSaveBinding: (
    tabKey: number,
    binding: InkcapSaveBinding | undefined,
  ) => void;
  onWrite: (
    tab: Tab,
    contents: string,
    expectedContent: string,
  ) => Promise<void>;
  onOverwrite: (tab: Tab, contents: string) => Promise<void>;
  onReadCurrent: (tab: Tab, reload: boolean) => Promise<string>;
};

export function InkcapView({
  model,
}: {
  model: InkcapViewModel;
}): React.JSX.Element {
  const [explorer, setExplorer] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !("ResizeObserver" in globalThis)) return;
    const measure = () => {
      setNarrow(element.clientWidth <= 576);
    };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const [treeLoadRequested, setTreeLoadRequested] = useState(false);
  const [selectedTreePath, setSelectedTreePath] = useState<string | null>(null);
  const id = useId();
  const computer =
    model.sourceLabel ?? model.context.computerName ?? "Computer";
  const dirty = model.tabs.filter((tab) => tab.dirty).length;
  // The shell's window status bar shows these beside the window's Computer.
  useWindowStatus(model.connection?.app, [
    {
      kind: "text",
      id: "documents",
      text: `${String(model.tabs.length)} ${model.tabs.length === 1 ? "open file" : "open files"}`,
    },
    {
      kind: "text",
      id: "save",
      text: dirty
        ? `${String(dirty)} unsaved`
        : model.downloadedFile?.tabKey === model.active
          ? `Downloaded ${model.downloadedFile.name}`
          : (model.repositoryStatus ??
            (model.tabs.length ? "All changes saved" : "Ready")),
      end: true,
    },
  ]);
  const active = model.tabs.find((tab) => tab.tabKey === model.active);
  useEffect(() => {
    setSelectedTreePath(null);
  }, [
    model.selectedConnection?.app.identity.surfaceId,
    model.context.computerId,
    model.context.projectPath,
  ]);
  useEffect(() => {
    if (
      explorer &&
      model.selectedConnection &&
      model.context.computerId !== null &&
      model.canList
    )
      setTreeLoadRequested(true);
  }, [
    explorer,
    model.canList,
    model.context.computerId,
    model.selectedConnection,
  ]);
  const fileTree = model.fileTree?.((path) => {
    model.onOpenFile(path);
    setFilesOpen(false);
  }) ?? (
    <FileTreePane
      model={model}
      treeLoadRequested={treeLoadRequested}
      active={active}
      computer={computer}
      onOpenFile={(path) => {
        model.onOpenFile(path);
        setFilesOpen(false);
      }}
      onSelectPath={setSelectedTreePath}
      onDismissExplorerDialog={() => {
        setFilesOpen(false);
      }}
    />
  );
  return (
    <main
      ref={root}
      className="inkcap-app"
      aria-label="Inkcap editor"
      onKeyDown={(event) => {
        // Native editor events cross its shadow root with a custom-element target.
        // Keep text entry out of surrounding workbench/host keyboard shortcuts.
        if (
          event.nativeEvent
            .composedPath()
            .some(
              (node) => node instanceof HTMLElement && node.isContentEditable,
            )
        ) {
          event.stopPropagation();
        }
      }}
    >
      {model.error ? (
        <Alert
          className="inkcap-notice"
          tone="error"
          title="Couldn't complete that action"
          description={model.error}
        />
      ) : null}
      <div className="inkcap-work" data-explorer={explorer}>
        {narrow ? (
          <Dialog open={filesOpen} onOpenChange={setFilesOpen}>
            <div className="inkcap-explorer-rail">
              <DialogTrigger
                render={
                  <IconButton
                    size="sm"
                    icon={<PanelLeft />}
                    aria-label="Open file explorer"
                  />
                }
              />
              <DialogContent className="inkcap-explorer-dialog">
                <DialogHeader>
                  <DialogTitle>File explorer</DialogTitle>
                  <DialogDescription>
                    {`Browse files on ${
                      model.sourceLabel ??
                      (!model.selectedConnection ||
                      model.context.computerId === null
                        ? "your Computer"
                        : computer)
                    }.`}
                  </DialogDescription>
                </DialogHeader>
                {fileTree}
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Close explorer
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </div>
          </Dialog>
        ) : (
          <div
            className="inkcap-explorer"
            id={`${id}-explorer`}
            hidden={!explorer}
          >
            {fileTree}
          </div>
        )}
        <Tabs
          className="inkcap-editors"
          value={model.active === null ? "" : String(model.active)}
          onValueChange={(value) => {
            const tab = model.tabs.find(
              (candidate) => String(candidate.tabKey) === value,
            );
            if (tab) model.onActivate(tab.tabKey);
          }}
        >
          <div className="inkcap-tab-bar">
            {narrow ? null : (
              <IconButton
                size="xs"
                variant="ghost"
                className="inkcap-explorer-toggle"
                icon={<PanelLeft />}
                aria-label="Toggle file explorer"
                title={explorer ? "Hide file explorer" : "Show file explorer"}
                aria-expanded={explorer}
                aria-controls={`${id}-explorer`}
                onClick={() => {
                  setExplorer((value) => !value);
                }}
              />
            )}
            <TabsList className="inkcap-tabs gap-0" aria-label="Editor tabs">
              {model.tabs.map((tab) => (
                <Fragment key={tab.tabKey}>
                  <TabsTrigger
                    className="inkcap-tab"
                    value={String(tab.tabKey)}
                    title={
                      tab.connection?.source
                        ? `${tab.path} · ${tab.connection.source.label}`
                        : tab.path
                    }
                  >
                    <FileCode2 aria-hidden="true" />
                    <span>{tab.path.split("/").at(-1)}</span>
                    {tab.dirty ? (
                      <span
                        className="inkcap-dirty"
                        aria-label="Unsaved changes"
                      />
                    ) : null}
                  </TabsTrigger>
                  <IconButton
                    size="xs"
                    variant="ghost"
                    icon={<X />}
                    aria-label={`Close ${tab.path}`}
                    onClick={() => {
                      model.onClose(tab.tabKey);
                    }}
                  />
                </Fragment>
              ))}
            </TabsList>
            <div className="inkcap-tab-actions">
              <IconButton
                icon={<FilePlus2 />}
                aria-label="New draft"
                title="New draft (⌘K, then N)"
                onClick={model.onNewDraft}
              />
            </div>
          </div>
          {model.tabs.map((tab) => (
            <Suspense
              key={tab.tabKey}
              fallback={<p role="status">Opening editor…</p>}
            >
              <FileTab
                activityNotice={
                  model.activityNotice?.path === tab.path &&
                  model.activityNotice.computerId === tab.computerId
                }
                onDismissActivityNotice={model.onDismissActivityNotice}
                path={tab.path}
                initial={tab.initial}
                active={model.active === tab.tabKey}
                narrow={narrow}
                local={tab.connection === null}
                savable={
                  tab.connection === null || isConnectionUsable(tab.connection)
                }
                sourceLabel={
                  (tab.connection ?? model.selectedConnection)?.source?.kind ===
                  "repository"
                    ? (tab.connection ?? model.selectedConnection)?.source
                        ?.label
                    : undefined
                }
                previewUrl={tab.previewUrl}
                previewKind={tab.previewKind}
                target={tab.target}
                syncConflict={
                  tab.connection?.source !== undefined &&
                  model.repositoryStates?.get(
                    `${tab.connection.source.id}:${tab.path}`,
                  )?.kind === "conflict"
                }
                tabKey={tab.tabKey}
                onSaveBinding={model.onSaveBinding}
                onReopen={
                  tab.connection === null
                    ? undefined
                    : () => {
                        model.onReopen(tab);
                      }
                }
                onSaveAs={async (path, contents) => {
                  const directory =
                    selectedTreePath &&
                    model.selectedConnection &&
                    (tab.connection === null ||
                      tab.connection === model.selectedConnection)
                      ? directoryForTreePath(selectedTreePath)
                      : tab.path.startsWith("/")
                        ? directoryForTreePath(tab.path)
                        : model.context.projectPath;
                  const acceptedPath =
                    (tab.connection ?? model.selectedConnection)?.source
                      ?.kind === "repository"
                      ? repositoryFilePath.parse(path.trim())
                      : tab.connection || model.selectedConnection
                        ? resolveComputerPath(path, directory)
                        : path.trim();
                  await model.onSaveAs(tab, acceptedPath, contents);
                  return acceptedPath;
                }}
                onPathChange={(path) => {
                  model.onPathChange(tab, path);
                }}
                onStatus={(dirty, saving) => {
                  model.onStatus(tab, dirty, saving);
                }}
                write={(contents, expectedContent) =>
                  model.onWrite(tab, contents, expectedContent)
                }
                overwrite={(contents) => model.onOverwrite(tab, contents)}
                readCurrent={(reload) => model.onReadCurrent(tab, reload)}
              />
            </Suspense>
          ))}
          {model.tabs.length === 0 ? (
            <EmptyState
              className="inkcap-empty"
              variant="panel"
              visual={<FileCode2 className="inkcap-empty-icon" />}
              title="A little room to think."
              description={`Open a file${model.canList ? " from the explorer" : ""}, or start with a blank page.`}
              actions={
                <>
                  <Button size="sm" onClick={model.onNewDraft}>
                    New draft
                  </Button>
                  <span className="inkcap-shortcut">
                    <Keycap size="sm">{leaderLabel()}</Keycap>
                    <span>then</span>
                    <Keycap size="sm">N</Keycap>
                  </span>
                </>
              }
            />
          ) : null}
        </Tabs>
      </div>
      <UnsavedDialog
        open={model.windowClosing || model.closing !== null}
        all={model.windowClosing}
        reviewWhileSaving={
          model.windowClosing
            ? model.tabs.some(
                (tab) => tab.connection?.source?.kind === "repository",
              )
            : model.tabs.some(
                (tab) =>
                  tab.tabKey === model.closing &&
                  tab.connection?.source?.kind === "repository",
              )
        }
        busy={
          model.windowCloseSaving ||
          model.tabs.some(
            (tab) => tab.tabKey === model.closing && tab.target.saving,
          )
        }
        error={model.error}
        onSave={
          model.windowClosing
            ? model.onSaveWindowClose
            : () => {
                if (model.closing !== null) model.onSaveClose(model.closing);
              }
        }
        onDiscard={
          model.windowClosing
            ? model.onDiscardWindowClose
            : () => {
                if (model.closing !== null) model.onDiscardClose(model.closing);
              }
        }
        onCancel={
          model.windowClosing ? model.onCancelWindowClose : model.onCancelClose
        }
      />
    </main>
  );
}

/** The Explorer pane: loading, denied-access, or the real file tree. */
function FileTreePane({
  model,
  treeLoadRequested,
  active,
  computer,
  onOpenFile,
  onSelectPath,
  onDismissExplorerDialog,
}: {
  model: InkcapViewModel;
  treeLoadRequested: boolean;
  active: Tab | undefined;
  computer: string;
  onOpenFile: (path: string) => void;
  onSelectPath: (path: string) => void;
  onDismissExplorerDialog: () => void;
}): React.JSX.Element {
  if (
    !model.selectedConnection ||
    model.context.computerId === null ||
    !model.canList
  )
    return (
      <EmptyState
        className="inkcap-tree inkcap-access"
        aria-label="File tree"
        variant="panel"
        visual={<FolderOpen aria-hidden="true" />}
        title={
          !model.selectedConnection
            ? "No Computer connected"
            : model.context.computerId === null
              ? "No Computer selected"
              : "Files unavailable"
        }
        description={
          !model.selectedConnection
            ? "No Computer is attached to this window. You can still write a draft."
            : model.context.computerId === null
              ? "No Computer is attached to this window. You can still write a draft."
              : "File access isn't granted. Your open documents remain available."
        }
        actions={
          <>
            <Button
              className="whitespace-nowrap"
              size="sm"
              onClick={model.onNewDraft}
            >
              New draft
            </Button>
            {model.connection && model.context.computerId === null && (
              <Button
                className="whitespace-nowrap"
                size="sm"
                variant="outline"
                onClick={() => {
                  onDismissExplorerDialog();
                  model.onChooseComputer();
                }}
              >
                Choose Computer
              </Button>
            )}
          </>
        }
      />
    );
  if (!treeLoadRequested)
    return (
      <aside className="inkcap-tree inkcap-access" role="status">
        Loading files…
      </aside>
    );
  return (
    <Suspense
      fallback={
        <aside className="inkcap-tree inkcap-access" role="status">
          Loading files…
        </aside>
      }
    >
      <InkcapFileTree
        key={`${model.selectedConnection.app.identity.surfaceId}:${model.context.computerId}:${model.context.projectPath}`}
        app={model.selectedConnection.app}
        rootPath={model.context.projectPath}
        rootLabel={computer}
        activePath={
          active?.connection === model.selectedConnection &&
          active.computerId === model.context.computerId
            ? active.path
            : null
        }
        onOpenFile={onOpenFile}
        onSelectPath={onSelectPath}
      />
    </Suspense>
  );
}

function isConnectionUsable(connection: Connection): boolean {
  const state = connection.app.lifecycle.get();
  return (
    state !== "disposing" && state !== "disposed" && state !== "disconnected"
  );
}

function UnsavedDialog({
  open,
  all,
  busy,
  reviewWhileSaving,
  error,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  all: boolean;
  busy: boolean;
  reviewWhileSaving: boolean;
  error: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open && !(reviewWhileSaving && busy)}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {all ? "Close Inkcap with unsaved changes" : "Unsaved changes"}
          </DialogTitle>
          <DialogDescription>
            {all
              ? "Save your changed documents before closing Inkcap?"
              : "Save your changes before closing this document?"}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert tone="error" title="Couldn't save" description={error} />
        ) : null}
        <DialogFooter>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>
            Discard
          </Button>
          <Button size="sm" disabled={busy} onClick={onSave}>
            {busy ? "Saving…" : all ? "Save all" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The shell's leader chord as the platform names it; New draft is leader, N. */
function leaderLabel(): string {
  return /Mac|iPhone|iPad/u.test(navigator.userAgent) ? "⌘ K" : "Ctrl K";
}
