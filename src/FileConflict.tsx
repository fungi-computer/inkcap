import { MultiFileDiff } from "@pierre/diffs/react";
import { Alert } from "@fungi.computer/caps/components/alert";
import { Button } from "@fungi.computer/caps/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@fungi.computer/caps/components/dialog";
import { comparisonText } from "./comparison.js";
import type { useFileDocument } from "./useFileDocument.js";

/** Conflict recovery stays in the document; this view never performs a file write. */
export function FileConflict({
  document,
  theme,
  sourceLabel,
  savedConflict = false,
}: {
  document: ReturnType<typeof useFileDocument>;
  theme: string;
  sourceLabel?: string;
  savedConflict?: boolean;
}) {
  if (!document.conflict) return null;
  const busy = document.saving || document.resolving;
  return (
    <>
      <div className="inkcap-conflict" role="region" aria-label="File conflict">
        <Alert
          tone="warning"
          title={
            sourceLabel
              ? "The repository changed since you opened this file"
              : "This file changed on the Computer since you opened it"
          }
          description={
            savedConflict
              ? "Your file is saved in Bonsai. Your saved text and any newer edits stay here."
              : "Your edits are still here and have not been saved."
          }
        />
        <div className="flex flex-wrap gap-xs">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              void document.keepMine();
            }}
          >
            Keep mine
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void document.reloadTheirs();
            }}
          >
            Reload theirs
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              void document.compare();
            }}
          >
            {document.resolving ? "Loading…" : "Compare"}
          </Button>
        </div>
        <p className="text-xs text-dim">
          Keep mine{" "}
          {sourceLabel
            ? "saves your file in Bonsai and retries sync"
            : "overwrites the Computer file"}
          . Reload theirs replaces your edits.
        </p>
      </div>
      <Dialog
        open={document.comparison !== null}
        onOpenChange={(open) => {
          if (!open) document.closeComparison();
        }}
      >
        <DialogContent className="inkcap-compare-dialog">
          <DialogHeader>
            <DialogTitle>Compare file versions</DialogTitle>
            <DialogDescription>
              Removed lines are from {sourceLabel ?? "the Computer"}. Added
              lines are your edits. Nothing is saved by comparing.
            </DialogDescription>
          </DialogHeader>
          <div
            className="inkcap-conflict-diff"
            role="region"
            aria-label="File comparison"
          >
            {document.comparison !== null ? (
              <MultiFileDiff
                oldFile={{
                  name: document.currentPath,
                  contents: comparisonText(document.comparison),
                }}
                newFile={{
                  name: document.currentPath,
                  contents: comparisonText(document.contents),
                }}
                options={{
                  diffStyle: "unified",
                  disableFileHeader: true,
                  themeType: theme === "mocha" ? "dark" : "light",
                  theme: {
                    dark: "catppuccin-mocha",
                    light: "catppuccin-latte",
                  },
                }}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={document.closeComparison}>
              Back to editing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
