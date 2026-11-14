import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PatchDiff } from "@pierre/diffs/react";
import type { AppRoot } from "@fungi.computer/agar";
import { describeAppError } from "@fungi.computer/agar/errors";
import { FailureLine } from "@fungi.computer/caps/components/failure-line";
import { Button } from "@fungi.computer/caps/components/button";
import { LoadingState } from "@fungi.computer/caps/blocks/loading-state";
import { FileCode2 } from "lucide-react";
import { TabsContent } from "@fungi.computer/caps/components/tabs";
import { getTheme, subscribeTheme } from "@fungi.computer/stipe/theme";
import { changesQuery } from "./changes-query.js";
import { patchesByPath, statusLabel, statusMark } from "./changes-patch.js";

export const diffTabValue = (path: string) => `diff:${path}`;

/** One changed file's diff at the editor's full width; deleted files are a read-only diff too. */
export function DiffTab({
  app,
  rootPath,
  path,
  narrow,
  onOpenFile,
}: {
  app: AppRoot;
  rootPath: string;
  path: string;
  narrow: boolean;
  onOpenFile: (path: string) => void;
}) {
  const changes = useQuery(changesQuery(app, rootPath));
  const repository = changes.data?.kind === "changes" ? changes.data : null;
  const file = repository?.files.find((candidate) => candidate.path === path);
  const patches = useMemo(
    () => patchesByPath(repository?.patch ?? ""),
    [repository?.patch],
  );
  const patch = patches.get(path);
  const slash = path.lastIndexOf("/");
  const directory = path.slice(0, slash + 1);
  const name = path.slice(slash + 1);
  const [theme, setTheme] = useState(() => getTheme() ?? "latte");
  const themeRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The App's own theme root, not the page: a window can theme itself.
    const root = themeRoot.current?.closest<HTMLElement>("[data-theme]");
    setTheme(getTheme(root ?? undefined) ?? "latte");
    return subscribeTheme(setTheme, root ?? undefined);
  }, []);
  return (
    <TabsContent
      ref={themeRoot}
      className="inkcap-diff-tab mt-0"
      value={diffTabValue(path)}
      aria-label={`Changes to ${path}`}
    >
      <div className="inkcap-diff-header">
        {file ? (
          <span
            className="inkcap-change-mark"
            data-status={file.status}
            role="img"
            aria-label={statusLabel[file.status]}
          >
            {statusMark[file.status]}
          </span>
        ) : null}
        <span className="inkcap-diff-path" title={path}>
          <span className="inkcap-diff-dir">{directory}</span>
          <span className="inkcap-diff-name">{name}</span>
        </span>
        {repository !== null && file?.status !== "deleted" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onOpenFile(
                `${repository.root === "/" ? "" : repository.root}/${path}`,
              );
            }}
          >
            <FileCode2 aria-hidden="true" /> Open file
          </Button>
        ) : null}
      </div>
      {changes.isError ? (
        <FailureLine
          message={describeAppError(changes.error).message}
          onRetry={() => void changes.refetch()}
        />
      ) : repository !== null && file === undefined ? (
        <p className="inkcap-tree-note">This file no longer has changes.</p>
      ) : patch ? (
        <div className="inkcap-diff-body">
          <PatchDiff
            patch={patch.patch}
            options={{
              diffStyle: "unified",
              // A phone wraps long lines instead of panning sideways.
              overflow: narrow ? "wrap" : "scroll",
              disableFileHeader: true,
              themeType: theme === "mocha" ? "dark" : "light",
              theme: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
            }}
          />
        </div>
      ) : repository !== null ? (
        <p className="inkcap-tree-note">No text changes to show.</p>
      ) : changes.isPending ? (
        <LoadingState message="Loading changes" size="sm" framed={false} />
      ) : (
        <p className="inkcap-tree-note">This folder is not a Git repository.</p>
      )}
    </TabsContent>
  );
}
