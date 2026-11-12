import { FailureLine } from "@fungi.computer/caps/components/failure-line";
import { describeAppError } from "@fungi.computer/agar/errors";
import { useEffect, useState, type CSSProperties } from "react";
import { FileTree } from "@pierre/trees/react";
import type { AppRoot } from "@fungi.computer/agar";
import { Button } from "@fungi.computer/caps/components/button";
import { IconButton } from "@fungi.computer/caps/components/icon-button";
import {
  computerWriteFile,
  listComputerFiles,
  writeComputerFile,
} from "@fungi.computer/agar/computer";
import { FilePlus2, FolderOpen, FolderPlus, RefreshCw } from "lucide-react";
import {
  TREE_ROW_HEIGHT_PX,
  useInkcapTreeModel,
} from "./useInkcapTreeModel.js";
import { directoryForTreePath, resolveComputerPath } from "./tree-path.js";
import { CreateEntryDialog, type EntryLocation } from "./CreateEntryDialog.js";

const nameTaken = "That name already exists in this directory.";

export function InkcapFileTree({
  app,
  onOpenFile,
  activePath,
  rootPath = "/",
  rootLabel = "Computer",
  onSelectPath,
  creationRequest = null,
  onCreationRequestHandled,
  rowHeight = TREE_ROW_HEIGHT_PX,
}: {
  app: AppRoot;
  rowHeight?: number;
  activePath: string | null;
  rootPath?: string;
  /** The Computer or workspace's real name, shown on the Explorer root row. */
  rootLabel?: string;
  onOpenFile: (path: string) => void;
  onSelectPath?: (path: string) => void;
  /** Open the create dialog from outside the tree, such as the empty editor. */
  creationRequest?: {
    kind: "file" | "folder";
    name?: string;
    /** Create the named entry now instead of asking for its name. */
    immediate?: boolean;
  } | null;
  onCreationRequestHandled?: () => void;
}): React.JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const tree = useInkcapTreeModel({
    app,
    rootPath,
    rootLabel,
    rowHeight,
    activePath,
    onOpenFile,
    onSelectPath: (path) => {
      setSelectedPath(path);
      onSelectPath?.(path);
    },
  });
  const [creation, setCreation] = useState<EntryLocation | null>(null);
  const canWrite = app.capabilities.has(computerWriteFile);

  function startCreation(kind: "file" | "folder", path: string): void {
    setCreation({ kind, directory: directoryForTreePath(path) });
  }

  useEffect(() => {
    if (!creationRequest) return;
    const request: EntryLocation = {
      kind: creationRequest.kind,
      directory: directoryForTreePath(selectedPath ?? `${rootPath}/`),
    };
    if (creationRequest.name !== undefined) request.name = creationRequest.name;
    if (
      creationRequest.immediate === true &&
      creationRequest.name !== undefined
    )
      void createNow(request, creationRequest.name);
    else setCreation(request);
    onCreationRequestHandled?.();
  }, [creationRequest, onCreationRequestHandled, rootPath, selectedPath]);

  /** A suggestion creates its file at once, or opens the one already there. */
  async function createNow(
    request: EntryLocation,
    entryName: string,
  ): Promise<void> {
    const failure = await createEntry(request, entryName);
    if (failure === nameTaken)
      onOpenFile(resolveComputerPath(entryName, request.directory));
    else if (failure !== undefined) setCreation(request);
  }

  async function createEntry(
    creation: EntryLocation,
    entryName: string,
  ): Promise<string | undefined> {
    const path = resolveComputerPath(entryName, creation.directory);
    try {
      let offset: number | null = 0;
      while (offset !== null) {
        const requestedOffset = offset;
        const page = await listComputerFiles(app.capabilities, {
          path: creation.directory,
          limit: 256,
          offset: requestedOffset,
        });
        if (page.entries.some((entry) => entry.name === entryName)) {
          return nameTaken;
        }
        if (page.nextOffset !== null && page.nextOffset <= requestedOffset) {
          return "Could not verify that name is available.";
        }
        offset = page.nextOffset;
      }
      if (creation.kind === "folder") {
        await app.capabilities.require(computerWriteFile).mkdir({ path });
        if (!tree.model.getItem(`${path}/`))
          tree.model.batch([{ type: "add", path: `${path}/` }]);
      } else {
        await writeComputerFile(
          app.capabilities,
          { path, content: new Blob([]) },
          {},
        );
        if (!tree.model.getItem(path))
          tree.model.batch([{ type: "add", path }]);
        onOpenFile(path);
      }
      return undefined;
    } catch (cause) {
      return cause instanceof Error
        ? describeAppError(cause).message
        : `Couldn't create ${creation.kind}. Check Computer write access.`;
    }
  }
  const style: CSSProperties & Record<`--${string}`, string> = {
    flex: "1",
    "--trees-item-height": `${String(rowHeight)}px`,
    // Rows sit on the Stipe grid: a 4px gutter, and row content starting at
    // 8px so the tree lines up with the Explorer header above it.
    "--trees-padding-inline-override": "var(--spacing-xs)",
    "--trees-item-margin-x-override": "0px",
    "--trees-item-padding-x-override": "var(--spacing-xs)",
    "--trees-item-row-gap-override": "var(--spacing-xs)",
    "--trees-bg-override": "var(--color-base-100)",
    "--trees-fg-override": "var(--color-base-content)",
    "--trees-bg-muted-override": "var(--color-base-200)",
    "--trees-selected-bg-override": "var(--color-base-300)",
    "--trees-border-radius-override": "var(--radius-field)",
    "--trees-font-family-override": "var(--font-sans)",
    "--trees-font-size-override": "12px",
  };
  return (
    <aside className="inkcap-tree" aria-label="File tree">
      <div className="inkcap-tree-toolbar">
        <span>
          <FolderOpen aria-hidden="true" /> Explorer
        </span>
        <span className="inkcap-tree-actions">
          <IconButton
            icon={<FilePlus2 />}
            aria-label="New file"
            title="New file"
            variant="ghost"
            size="responsive"
            disabled={!canWrite}
            onClick={() => {
              startCreation("file", selectedPath ?? `${rootPath}/`);
            }}
          />
          <IconButton
            icon={<FolderPlus />}
            aria-label="New folder"
            title="New folder"
            variant="ghost"
            size="responsive"
            disabled={!canWrite}
            onClick={() => {
              startCreation("folder", selectedPath ?? `${rootPath}/`);
            }}
          />
          <IconButton
            icon={<RefreshCw />}
            aria-label="Refresh files"
            title="Refresh files"
            variant="ghost"
            size="responsive"
            disabled={tree.busy}
            onClick={tree.reloadRoot}
          />
        </span>
      </div>
      {tree.error && (
        <FailureLine message={tree.error} onRetry={tree.reloadRoot} />
      )}
      {tree.rootEmpty ? <p className="inkcap-tree-note">Empty folder</p> : null}
      <FileTree
        model={tree.model}
        style={style}
        renderContextMenu={(item, context) => (
          <div className="flex min-w-36 flex-col gap-xs p-xs" role="menu">
            <Button
              className="w-full justify-start"
              disabled={!canWrite}
              role="menuitem"
              title={
                canWrite ? undefined : "Computer write access is not granted."
              }
              size="sm"
              variant="ghost"
              onClick={() => {
                context.close({ restoreFocus: false });
                startCreation("file", item.path);
              }}
            >
              <FilePlus2 aria-hidden="true" /> New file
            </Button>
            <Button
              className="w-full justify-start"
              disabled={!canWrite}
              role="menuitem"
              title={
                canWrite ? undefined : "Computer write access is not granted."
              }
              size="sm"
              variant="ghost"
              onClick={() => {
                context.close({ restoreFocus: false });
                startCreation("folder", item.path);
              }}
            >
              <FolderPlus aria-hidden="true" /> New folder
            </Button>
          </div>
        )}
      />
      <CreateEntryDialog
        creation={creation}
        rootPath={rootPath}
        onCreate={createEntry}
        onClose={() => {
          setCreation(null);
        }}
      />
      {tree.page.next !== null && (
        <Button disabled={tree.busy} onClick={tree.loadNext}>
          More in {tree.page.path}
        </Button>
      )}
    </aside>
  );
}
