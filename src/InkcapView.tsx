import { useQuery } from "@tanstack/react-query";
import { describeAppError } from "@fungi.computer/agar/errors";
import { FailureLine } from "@fungi.computer/caps/components/failure-line";
import { directoryQuery } from "./tree-queries.js";
import { computerWriteFile } from "@fungi.computer/agar/computer";
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
import { LoadingState } from "@fungi.computer/caps/blocks/loading-state";
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
import { leaderKeys, leaderText } from "./platform-keys.js";

const FileTab = lazy(async () => {
  const module = await import("./FileTab.js");
  return { default: module.FileTab };
});

const InkcapFileTree = lazy(async () => {
  const module = await import("./InkcapFileTree.js");
  return { default: module.InkcapFileTree };
});

export type InkcapViewModel = {
  fileTree?: (
    onOpenFile: (path: string) => void,
    narrow: boolean,
  ) => React.ReactNode;
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
  onSaved: (name: string, downloaded: boolean) => void;
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
  const canBrowseFiles =
    model.canList &&
    model.selectedConnection !== null &&
    model.context.computerId !== null &&
    !model.selectedConnection.source;
  const listing = useQuery(
    directoryQuery(
      canBrowseFiles ? (model.selectedConnection?.app ?? null) : null,
      model.context.projectPath,
    ),
  );
  const savedFiles =
    listing.data?.entries.filter((entry) => entry.type === "file") ?? [];
  const savedFile = savedFiles.at(0);
  const repository = model.selectedConnection?.source?.kind === "repository";
  const canCreateFile =
    model.canList &&
    model.selectedConnection !== null &&
    model.context.computerId !== null &&
    !model.selectedConnection.source &&
    model.selectedConnection.app.capabilities.has(computerWriteFile);
  const [creationRequest, setCreationRequest] = useState<{
    kind: "file" | "folder";
    name?: string;
    immediate?: boolean;
  } | null>(null);
  const id = useId();
  const explorerDirectory = (tab: Tab): string =>
    selectedTreePath &&
    model.selectedConnection &&
    (tab.connection === null || tab.connection === model.selectedConnection)
      ? directoryForTreePath(selectedTreePath)
      : tab.path.startsWith("/")
        ? directoryForTreePath(tab.path)
        : model.context.projectPath;
  const downloadsFor = (tab: Tab): boolean => {
    const target = tab.connection ?? model.selectedConnection;
    return (
      !target ||
      (target.source?.kind !== "repository" &&
        target.app.context.get().computerId === null)
    );
  };
  const saveAsDirectory = (tab: Tab): string | null => {
    const target = tab.connection ?? model.selectedConnection;
    if (!target) return null;
    const directory = explorerDirectory(tab);
    return target.source?.kind === "repository"
      ? directory.replace(/^\/+/u, "") || null
      : directory;
  };
  const computer =
    model.sourceLabel ?? model.context.computerName ?? "Computer";
  const dirty = model.tabs.filter((tab) => tab.dirty).length;
  // The shell's window status bar shows these beside the window's Computer.
  useWindowStatus(model.connection?.app, [
    {
      kind: "text",
      id: "documents",
      priority: "low",
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
  }, narrow) ?? (
    <FileTreePane
      model={model}
      narrow={narrow}
      treeLoadRequested={treeLoadRequested}
      active={active}
      computer={computer}
      onOpenFile={(path) => {
        model.onOpenFile(path);
        setFilesOpen(false);
      }}
      onSelectPath={setSelectedTreePath}
      creationRequest={creationRequest}
      onCreationRequestHandled={() => {
        setCreationRequest(null);
      }}
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
        {narrow ? null : (
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
            {narrow ? (
              <Dialog open={filesOpen} onOpenChange={setFilesOpen}>
                <DialogTrigger
                  render={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="inkcap-files-button"
                    >
                      <PanelLeft aria-hidden="true" /> Files
                    </Button>
                  }
                />
                <DialogContent className="inkcap-explorer-dialog">
                  <DialogHeader>
                    <DialogTitle>Files</DialogTitle>
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
                      Close
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <IconButton
                size="responsive"
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
                    size="responsive"
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
                size="responsive"
                icon={<FilePlus2 />}
                aria-label="New draft"
                title={`New draft (${leaderText()}, then N)`}
                onClick={model.onNewDraft}
              />
            </div>
          </div>
          {model.tabs.map((tab) => (
            <Suspense
              key={tab.tabKey}
              fallback={
                <LoadingState
                  message="Opening editor"
                  size="sm"
                  framed={false}
                />
              }
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
                saveAsDirectory={saveAsDirectory(tab)}
                downloads={downloadsFor(tab)}
                onSaved={model.onSaved}
                onSaveAs={async (path, contents) => {
                  const directory = explorerDirectory(tab);
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
          {model.tabs.length === 0 &&
          listing.isError &&
          (!explorer || (narrow && !filesOpen)) ? (
            <FailureLine
              message={describeAppError(listing.error).message}
              onRetry={() => {
                void listing.refetch();
              }}
            />
          ) : model.tabs.length === 0 ? (
            <EmptyState
              className="inkcap-empty"
              variant="quiet"
              visual="blobs"
              title={
                repository
                  ? "Open a repository file"
                  : savedFiles.length > 0
                    ? "Open a saved file"
                    : !canCreateFile
                      ? "Write a draft"
                      : "Start your first file"
              }
              description={
                repository
                  ? "Browse the repository to choose a file to edit."
                  : savedFiles.length > 0
                    ? "Your files are saved here. Choose one to keep working."
                    : !canCreateFile
                      ? canBrowseFiles
                        ? "This folder is read-only. Open a file or write a draft."
                        : "Drafts stay in this window until you save them."
                      : "Write notes or code and save them here."
              }
              primaryAction={
                repository
                  ? {
                      label: "Browse files",
                      onSelect: () => {
                        setExplorer(true);
                        setFilesOpen(true);
                      },
                    }
                  : savedFile
                    ? {
                        label: `Open ${savedFile.name}`,
                        onSelect: () => {
                          model.onOpenFile(
                            resolveComputerPath(
                              savedFile.name,
                              model.context.projectPath,
                            ),
                          );
                        },
                      }
                    : canCreateFile
                      ? {
                          label: "New file",
                          onSelect: () => {
                            setTreeLoadRequested(true);
                            if (narrow) setFilesOpen(true);
                            setCreationRequest({ kind: "file" });
                          },
                        }
                      : { label: "New draft", onSelect: model.onNewDraft }
              }
              suggestions={
                savedFiles.length > 0
                  ? savedFiles.slice(1, 9).map((entry) => ({
                      label: entry.name,
                      onSelect: () => {
                        model.onOpenFile(
                          resolveComputerPath(
                            entry.name,
                            model.context.projectPath,
                          ),
                        );
                      },
                    }))
                  : canCreateFile
                    ? ["notes.md", "todo.md", "ideas.md"].map((name) => ({
                        label: name,
                        onSelect: () => {
                          setTreeLoadRequested(true);
                          if (narrow) setFilesOpen(true);
                          setCreationRequest({
                            kind: "file",
                            name,
                            immediate: true,
                          });
                        },
                      }))
                    : undefined
              }
              secondaryAction={
                savedFiles.length > 0 ? (
                  <Button
                    variant="outline"
                    disabled={!canCreateFile}
                    title={
                      canCreateFile
                        ? undefined
                        : "File write access is not granted."
                    }
                    onClick={() => {
                      setTreeLoadRequested(true);
                      if (narrow) setFilesOpen(true);
                      setCreationRequest({ kind: "file" });
                    }}
                  >
                    New file
                  </Button>
                ) : undefined
              }
              actions={
                savedFiles.length === 0 && !narrow ? (
                  <span className="inkcap-shortcut">
                    <span>New draft:</span>
                    {leaderKeys().map((key) => (
                      <Keycap key={key} size="sm">
                        {key}
                      </Keycap>
                    ))}
                    <span>then</span>
                    <Keycap size="sm">N</Keycap>
                  </span>
                ) : undefined
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
  narrow,
  treeLoadRequested,
  active,
  computer,
  onOpenFile,
  onSelectPath,
  creationRequest,
  onCreationRequestHandled,
  onDismissExplorerDialog,
}: {
  model: InkcapViewModel;
  narrow: boolean;
  treeLoadRequested: boolean;
  active: Tab | undefined;
  computer: string;
  onOpenFile: (path: string) => void;
  onSelectPath: (path: string) => void;
  creationRequest: {
    kind: "file" | "folder";
    name?: string;
    immediate?: boolean;
  } | null;
  onCreationRequestHandled: () => void;
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
          !model.selectedConnection || model.context.computerId === null
            ? "Pick a Computer with the Computer picker to browse its files. You can still write a draft."
            : "File access isn't granted. Your open documents remain available."
        }
        actions={
          model.connection && model.context.computerId === null ? (
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
          ) : undefined
        }
      />
    );
  if (!treeLoadRequested)
    return (
      <LoadingState
        className="inkcap-tree inkcap-access"
        message="Loading files"
        size="sm"
        framed={false}
      />
    );
  return (
    <Suspense
      fallback={
        <LoadingState
          className="inkcap-tree inkcap-access"
          message="Loading files"
          size="sm"
          framed={false}
        />
      }
    >
      <InkcapFileTree
        key={`${model.selectedConnection.app.identity.surfaceId}:${model.context.computerId}:${model.context.projectPath}:${String(narrow)}`}
        rowHeight={narrow ? 44 : 32}
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
        creationRequest={creationRequest}
        onCreationRequestHandled={onCreationRequestHandled}
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
