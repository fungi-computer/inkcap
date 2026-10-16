import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { GitStatusEntry } from "@pierre/trees";
import { IconButton } from "@fungi.computer/caps/components/icon-button";
import { FolderOpen, RefreshCw } from "lucide-react";
import type { BonsaiSnapshot } from "./bonsai-repository.js";

export function RepositoryTree({
  files,
  dirtyPaths,
  activePath,
  busy,
  onRefresh,
  onOpenFile,
}: {
  files: BonsaiSnapshot["files"];
  dirtyPaths: string[];
  activePath: string | null;
  busy: boolean;
  onRefresh: () => void;
  onOpenFile: (path: string) => void;
}) {
  const current = useRef({ files, onOpenFile });
  current.current = { files, onOpenFile };
  const { model } = useFileTree({
    paths: [],
    initialExpansion: "open",
    itemHeight: 32,
    onSelectionChange(paths) {
      const path = paths[0];
      if (
        path &&
        !path.endsWith("/") &&
        current.current.files.some((file) => file.path === path)
      )
        current.current.onOpenFile(path);
    },
  });
  const statuses = useMemo<GitStatusEntry[]>(() => {
    const dirty = new Set(dirtyPaths);
    return files.flatMap((file) =>
      dirty.has(file.path)
        ? [
            {
              path: file.path,
              status: "modified",
            },
          ]
        : [],
    );
  }, [files, dirtyPaths]);
  useEffect(() => {
    model.resetPaths(files.map((file) => file.path));
  }, [model, files]);
  useEffect(() => {
    model.setGitStatus(statuses);
  }, [model, statuses]);
  useEffect(() => {
    for (const path of model.getSelectedPaths())
      if (path !== activePath) model.getItem(path)?.deselect();
    if (activePath) model.getItem(activePath)?.select();
  }, [model, activePath]);
  const style: CSSProperties & Record<`--${string}`, string> = {
    flex: "1",
    "--trees-item-height": "32px",
    "--trees-padding-inline-override": "var(--spacing-xs)",
    "--trees-item-margin-x-override": "0px",
    "--trees-item-padding-x-override": "var(--spacing-xs)",
    "--trees-item-row-gap-override": "var(--spacing-xs)",
    "--trees-border-radius-override": "var(--radius-field)",
    "--trees-bg-override": "var(--color-base-100)",
    "--trees-fg-override": "var(--color-base-content)",
    "--trees-bg-muted-override": "var(--color-base-200)",
    "--trees-selected-bg-override": "var(--color-base-300)",
    "--trees-font-family-override": "var(--font-sans)",
    "--trees-font-size-override": "12px",
  };
  return (
    <aside className="inkcap-tree" aria-label="Repository files">
      <div className="inkcap-tree-toolbar">
        <span>
          <FolderOpen aria-hidden="true" /> Explorer
        </span>
        <IconButton
          icon={<RefreshCw />}
          aria-label="Refresh repository"
          variant="ghost"
          size="xs"
          disabled={busy}
          onClick={onRefresh}
        />
      </div>
      <p className="inkcap-repository-legend">
        Changes in latest commit · drafts marked modified
      </p>
      <FileTree model={model} style={style} />
    </aside>
  );
}
