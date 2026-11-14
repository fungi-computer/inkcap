import { useMemo } from "react";
import { Button } from "@fungi.computer/caps/components/button";
import { EmptyState } from "@fungi.computer/caps/blocks/empty-state";
import type { GitChangedFile } from "@fungi.computer/computer-contract";
import { patchesByPath, statusLabel, statusMark } from "./changes-patch.js";

/** The Changes list: one row per changed file; a row opens that file's diff in the editor area. */
export function ChangesPanel({
  files,
  patch,
  truncated,
  activeDiff,
  rowHeight,
  onOpenDiff,
}: {
  files: readonly GitChangedFile[];
  patch: string;
  truncated: boolean;
  /** The file whose diff is showing, marked as the current row. */
  activeDiff: string | null;
  /** The Explorer's row height, so the two lists read as one. */
  rowHeight: number;
  onOpenDiff: (path: string) => void;
}) {
  const patches = useMemo(() => patchesByPath(patch), [patch]);
  if (files.length === 0)
    return (
      <EmptyState
        className="inkcap-changes-empty"
        variant="quiet"
        title="No changes yet"
        description="Files the Agent edits show up here."
      />
    );
  return (
    <div className="inkcap-changes-list">
      {truncated ? (
        <p className="inkcap-tree-note">
          Showing the first part of a large change. Review the rest in a
          terminal.
        </p>
      ) : null}
      <ul>
        {files.map((file) => {
          const counts = patches.get(file.path);
          return (
            <li key={`${file.status}:${file.path}`}>
              <Button
                className="inkcap-change-file"
                style={{ minHeight: rowHeight }}
                size="sm"
                variant="ghost"
                aria-current={activeDiff === file.path ? "true" : undefined}
                title={`Review changes to ${file.path}`}
                onClick={() => {
                  onOpenDiff(file.path);
                }}
              >
                <span
                  className="inkcap-change-mark"
                  data-status={file.status}
                  role="img"
                  aria-label={statusLabel[file.status]}
                >
                  {statusMark[file.status]}
                </span>
                <span className="inkcap-change-path">{file.path}</span>
                {counts ? (
                  <span className="inkcap-change-counts">
                    {counts.additions > 0 ? (
                      <span className="inkcap-change-added">
                        +{counts.additions}
                      </span>
                    ) : null}
                    {counts.deletions > 0 ? (
                      <span className="inkcap-change-removed">
                        −{counts.deletions}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
