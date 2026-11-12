import { saveAvailability } from "./save-availability.js";
import type { TargetCheck } from "./path-exists.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditProvider, File as DiffsFile } from "@pierre/diffs/react";
import { Editor } from "@pierre/diffs/edit";
import { Button } from "@fungi.computer/caps/components/button";
import { IconButton } from "@fungi.computer/caps/components/icon-button";
import { TabsContent } from "@fungi.computer/caps/components/tabs";
import { Input } from "@fungi.computer/caps/components/input";
import { Alert } from "@fungi.computer/caps/components/alert";
import { MoreHorizontal, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@fungi.computer/caps/components/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@fungi.computer/caps/components/dialog";
import { Field } from "@fungi.computer/caps/components/field";
import { Markdown } from "@fungi.computer/caps/components/markdown";
import { getTheme, subscribeTheme } from "@fungi.computer/stipe/theme";
import { useForm, useSelector } from "@tanstack/react-form";
import { FileConflict } from "./FileConflict.js";
import { useFileDocument, type DocumentTarget } from "./useFileDocument.js";
import type { InkcapSaveBinding } from "./commands.js";
import { draftSavePath } from "./tree-path.js";
import { imageMediaType, isMarkdownPath } from "./read-for-open.js";

export function FileTab({
  path,
  initial,
  active,
  menuSlot,
  narrow,
  tabKey,
  savable,
  local,
  sourceLabel,
  activityNotice,
  onDismissActivityNotice,
  previewUrl,
  previewKind,
  onReopen,
  onSaveAs,
  pathExists,
  onPathChange,
  target,
  write,
  overwrite,
  readCurrent,
  onStatus,
  onSaveBinding,
  saveAsDirectory,
  downloads = false,
  onSaved,
  syncConflict = false,
}: {
  path: string;
  initial: string;
  active: boolean;
  /** Where the active file's More menu renders: the end of the tab strip. */
  menuSlot: HTMLElement | null;
  narrow: boolean;
  tabKey: number;
  savable: boolean;
  local: boolean;
  sourceLabel?: string;
  activityNotice?: boolean;
  onDismissActivityNotice?: () => void;
  previewUrl?: string;
  previewKind?: "image" | "video";
  onReopen?: () => void;
  onSaveAs?: (path: string, contents: string) => Promise<string>;
  /** Whether Save As to this path would replace another file. */
  pathExists?: (path: string) => Promise<TargetCheck>;
  onPathChange?: (path: string) => void;
  target?: DocumentTarget;
  write: (contents: string, expectedContent: string) => Promise<void>;
  overwrite: (contents: string) => Promise<void>;
  readCurrent: (reload: boolean) => Promise<string>;
  syncConflict?: boolean;
  /** The explorer directory a draft's Save As starts in, when there is one. */
  saveAsDirectory?: string | null;
  /** With no Computer, Save As hands the file to the browser as a download. */
  downloads?: boolean;
  /** Told the file name after every save, for the host toast. */
  onSaved?: (name: string, downloaded: boolean) => void;
  onStatus: (dirty: boolean, saving: boolean) => void;
  onSaveBinding: (
    tabKey: number,
    binding: InkcapSaveBinding | undefined,
  ) => void;
}): React.JSX.Element {
  const [theme, setTheme] = useState(() => getTheme() ?? "latte");
  const themeRoot = useRef<HTMLDivElement>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState(false);
  useEffect(() => {
    const root = themeRoot.current?.closest<HTMLElement>("[data-theme]");
    setTheme(getTheme(root ?? undefined) ?? "latte");
    return subscribeTheme(setTheme, root ?? undefined);
  }, []);
  const document = useFileDocument({
    path,
    initial,
    local,
    onSaveAs,
    onPathChange,
    onStatus,
    target,
    write,
    overwrite,
    readCurrent,
    syncConflict,
  });
  const saveRef = useRef(document.save);
  const localRef = useRef(local);
  const pathRef = useRef(document.currentPath);
  const onSavedRef = useRef(onSaved);
  const downloadsRef = useRef(downloads);
  const savingRef = useRef(document.saving);
  const savableRef = useRef(savable);
  const dirtyRef = useRef(false);
  const closedRef = useRef(false);
  const canSaveAsRef = useRef(false);
  // Read the editor at Save time so the write uses the live document.
  const editorRef = useRef<Editor<unknown> | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (active) editorRef.current?.focus();
  }, [active]);
  const editRef = useRef(document.edit);
  const contentsRef = useRef(document.contents);
  editRef.current = document.edit;
  contentsRef.current = document.contents;
  const pendingText = (): string | null => {
    const live = editorRef.current?.getFile()?.contents;
    return live !== undefined && live !== contentsRef.current ? live : null;
  };
  saveRef.current = document.save;
  localRef.current = local;
  pathRef.current = document.currentPath;
  onSavedRef.current = onSaved;
  downloadsRef.current = downloads;
  savingRef.current = document.saving;
  savableRef.current = savable && !document.conflict && !document.resolving;
  dirtyRef.current = document.dirty;
  closedRef.current = target?.closed ?? false;
  canSaveAsRef.current = Boolean(onSaveAs && !previewUrl);
  const saveAndAnnounce = async (): Promise<boolean> => {
    if (localRef.current) {
      setSaveAsOpen(true);
      return true;
    }
    const pending = pendingText();
    if (pending !== null) editRef.current(pending);
    const saved = await saveRef.current();
    if (saved)
      onSavedRef.current?.(leafOf(pathRef.current), downloadsRef.current);
    return saved;
  };
  const saveAsAndAnnounce = async (nextPath: string): Promise<boolean> => {
    const saved = await document.saveAs(nextPath);
    if (saved) onSavedRef.current?.(leafOf(nextPath), downloadsRef.current);
    return saved;
  };
  const saveBinding = useMemo<InkcapSaveBinding>(
    () => ({
      availability: () =>
        saveAvailability({
          local: localRef.current,
          closed: closedRef.current,
          savable: savableRef.current,
          saving: target?.saving ?? savingRef.current,
          dirty: dirtyRef.current,
        }),
      save: () => saveAndAnnounce(),
      saveAsAvailability: () => {
        if (closedRef.current || !canSaveAsRef.current)
          return {
            status: "unavailable",
            reason: "This file cannot be saved as.",
          };
        if (!savableRef.current)
          return {
            status: "unavailable",
            reason: "No focused savable document.",
          };
        return (target?.saving ?? savingRef.current)
          ? { status: "unavailable", reason: "A save is already running." }
          : { status: "available" };
      },
      saveAs: () => {
        setSaveAsOpen(true);
      },
    }),
    [],
  );
  useEffect(() => {
    onSaveBinding(tabKey, saveBinding);
    return () => {
      onSaveBinding(tabKey, undefined);
    };
    // Republish when the state behind availability changes so the command
    // catalog and File menu re-read it after this render's refs are current.
  }, [
    onSaveBinding,
    saveBinding,
    tabKey,
    document.dirty,
    document.saving,
    document.conflict,
    document.resolving,
    savable,
    target?.closed,
  ]);
  const file = useMemo(
    () => ({ name: document.currentPath, contents: document.contents }),
    [document.currentPath, document.contents],
  );
  const editorOptions = useMemo<
    NonNullable<Parameters<typeof DiffsFile>[0]["editorOptions"]>
  >(
    () => ({
      onAttach: (editor) => {
        editorRef.current = editor;
        // Initialize a new editor once; tab activation preserves its selection.
        if (activeRef.current) editor.focus({ lineNumber: 1, character: 0 });
      },
      onChange: (next) => {
        editRef.current(next.contents);
      },
    }),
    [],
  );

  const canPreviewMarkdown = isMarkdownPath(document.currentPath);
  return (
    <FileTabLayout
      themeRoot={themeRoot}
      menuSlot={active ? menuSlot : null}
      tabKey={tabKey}
      savable={savable}
      narrow={narrow}
      local={local}
      sourceLabel={sourceLabel}
      savedConflict={syncConflict}
      activityNotice={activityNotice}
      onDismissActivityNotice={onDismissActivityNotice}
      previewUrl={previewUrl}
      previewKind={previewKind}
      onSaveAs={onSaveAs}
      pathExists={downloads ? undefined : pathExists}
      onSave={saveAndAnnounce}
      onSubmitSaveAs={saveAsAndAnnounce}
      saveAsDirectory={downloads ? null : (saveAsDirectory ?? null)}
      downloads={downloads}
      onReopen={onReopen}
      document={document}
      file={file}
      editorOptions={editorOptions}
      theme={theme}
      saveAsOpen={saveAsOpen}
      setSaveAsOpen={setSaveAsOpen}
      canPreviewMarkdown={canPreviewMarkdown}
      markdownPreview={canPreviewMarkdown && markdownPreview}
      onToggleMarkdownPreview={() => {
        setMarkdownPreview((value) => !value);
      }}
    />
  );
}

function FileTabLayout({
  themeRoot,
  menuSlot,
  tabKey,
  savable,
  narrow,
  local,
  sourceLabel,
  savedConflict,
  activityNotice,
  onDismissActivityNotice,
  previewUrl,
  previewKind,
  onSaveAs,
  pathExists,
  onSave,
  onSubmitSaveAs,
  saveAsDirectory,
  downloads,
  onReopen,
  document,
  file,
  editorOptions,
  theme,
  saveAsOpen,
  setSaveAsOpen,
  canPreviewMarkdown,
  markdownPreview,
  onToggleMarkdownPreview,
}: {
  themeRoot: React.RefObject<HTMLDivElement>;
  menuSlot: HTMLElement | null;
  tabKey: number;
  savable: boolean;
  narrow: boolean;
  local: boolean;
  sourceLabel?: string;
  savedConflict: boolean;
  activityNotice?: boolean;
  onDismissActivityNotice?: () => void;
  previewUrl?: string;
  previewKind?: "image" | "video";
  onSaveAs?: (path: string, contents: string) => Promise<string>;
  pathExists?: (path: string) => Promise<TargetCheck>;
  onSave: () => Promise<boolean>;
  onSubmitSaveAs: (path: string) => Promise<boolean>;
  saveAsDirectory: string | null;
  downloads: boolean;
  onReopen?: () => void;
  document: ReturnType<typeof useFileDocument>;
  file: { name: string; contents: string };
  editorOptions: NonNullable<Parameters<typeof DiffsFile>[0]["editorOptions"]>;
  theme: string;
  saveAsOpen: boolean;
  setSaveAsOpen: (open: boolean) => void;
  canPreviewMarkdown: boolean;
  markdownPreview: boolean;
  onToggleMarkdownPreview: () => void;
}): React.JSX.Element {
  return (
    <TabsContent
      ref={themeRoot}
      className="inkcap-editor mt-0"
      value={String(tabKey)}
      forceMount
      aria-label={document.currentPath}
    >
      {menuSlot
        ? createPortal(
            <FileMenu
              savable={savable && !document.conflict && !document.resolving}
              path={document.currentPath}
              dirty={document.dirty}
              saving={document.saving}
              local={local}
              canSaveAs={Boolean(onSaveAs && !previewUrl)}
              canPreviewMarkdown={canPreviewMarkdown}
              markdownPreview={markdownPreview}
              onToggleMarkdownPreview={onToggleMarkdownPreview}
              onSave={() => {
                void onSave().catch((cause: unknown) => {
                  console.error("Inkcap save failed", cause);
                  return undefined;
                });
              }}
              onSaveAs={() => {
                setSaveAsOpen(true);
              }}
              onReopen={onReopen}
            />,
            menuSlot,
          )
        : null}
      {activityNotice ? (
        <Alert
          className="inkcap-notice"
          tone="warning"
          role="status"
          title="Recent files didn't update"
          description={`${saveLabel(local, document.dirty, document.saving)} worked; the Recent Files list could not record it.`}
          action={
            <IconButton
              icon={<X />}
              aria-label="Dismiss Recent Files notice"
              title="Dismiss Recent Files notice"
              variant="ghost"
              size="responsive"
              onClick={onDismissActivityNotice}
            />
          }
        />
      ) : null}
      <FileConflict
        document={document}
        theme={theme}
        sourceLabel={sourceLabel}
        savedConflict={savedConflict}
      />
      {document.error ? (
        <Alert
          className="inkcap-notice"
          tone="error"
          title={
            document.conflict
              ? "Couldn't resolve the file conflict"
              : "Couldn't save"
          }
          description={document.error}
        />
      ) : null}
      <FileContent
        // The editor binds to one file; Save As renames it, so it gets a new one.
        key={`${String(document.reloadVersion)}:${document.currentPath}`}
        previewUrl={previewUrl}
        previewKind={previewKind}
        path={document.currentPath}
        imageError={document.imageError}
        setImageError={document.setImageError}
        file={file}
        editorOptions={editorOptions}
        theme={theme}
        narrow={narrow}
        markdownPreview={markdownPreview}
      />
      <SaveAsDialog
        sourceLabel={sourceLabel}
        error={document.error}
        path={
          local && !document.currentPath.startsWith("/")
            ? draftSavePath(
                saveAsDirectory,
                document.currentPath,
                document.contents,
              )
            : document.currentPath
        }
        selectName={local}
        downloads={downloads}
        open={saveAsOpen}
        busy={document.saving}
        pathExists={pathExists}
        onSubmit={onSubmitSaveAs}
        onOpenChange={setSaveAsOpen}
      />
    </TabsContent>
  );
}

function FileMenu({
  savable,
  path,
  dirty,
  saving,
  local,
  canSaveAs,
  canPreviewMarkdown,
  markdownPreview,
  onToggleMarkdownPreview,
  onSave,
  onSaveAs,
  onReopen,
}: {
  savable: boolean;
  path: string;
  dirty: boolean;
  saving: boolean;
  local: boolean;
  canSaveAs: boolean;
  canPreviewMarkdown: boolean;
  markdownPreview: boolean;
  onToggleMarkdownPreview: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onReopen?: () => void;
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton
            variant="ghost"
            size="responsive"
            icon={<MoreHorizontal />}
            aria-label="More"
            title="More"
          />
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!savable || (!local && !dirty) || saving}
          onSelect={onSave}
        >
          {saveLabel(local, dirty, saving)}
        </DropdownMenuItem>
        {canSaveAs ? (
          <DropdownMenuItem disabled={!savable || saving} onSelect={onSaveAs}>
            Save file as
          </DropdownMenuItem>
        ) : null}
        {onReopen ? (
          <DropdownMenuItem
            disabled={!savable || dirty || saving}
            onSelect={onReopen}
          >
            Reload from disk
          </DropdownMenuItem>
        ) : null}
        {canPreviewMarkdown ? (
          <DropdownMenuCheckboxItem
            checked={markdownPreview}
            onSelect={onToggleMarkdownPreview}
          >
            Preview Markdown
          </DropdownMenuCheckboxItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void globalThis.navigator.clipboard
              .writeText(path)
              .catch((cause: unknown) => {
                console.error("Inkcap could not copy the path", cause);
              });
          }}
        >
          Copy path
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function saveLabel(local: boolean, dirty: boolean, saving: boolean): string {
  if (saving) return "Saving…";
  return local || dirty ? "Save" : "Saved";
}

/** The file name of a path, for the saved-name toast. */
function leafOf(path: string): string {
  return path.trim().split("/").at(-1) ?? path;
}

/** The part of a path to select: after the last slash, before the extension. */
function nameRange(path: string): [number, number] {
  const start = path.lastIndexOf("/") + 1;
  const dot = path.lastIndexOf(".");
  return [start, dot > start ? dot : path.length];
}

function FileContent({
  previewUrl,
  previewKind,
  path,
  imageError,
  setImageError,
  file,
  editorOptions,
  theme,
  narrow,
  markdownPreview,
}: {
  previewUrl?: string;
  previewKind?: "image" | "video";
  path: string;
  imageError: boolean;
  setImageError: (failed: boolean) => void;
  file: { name: string; contents: string };
  editorOptions: NonNullable<Parameters<typeof DiffsFile>[0]["editorOptions"]>;
  theme: string;
  narrow: boolean;
  markdownPreview: boolean;
}): React.JSX.Element {
  if (previewUrl)
    return previewKind === "video" ? (
      <VideoPreview path={path} url={previewUrl} />
    ) : (
      <ImagePreview
        path={path}
        url={previewUrl}
        failed={imageError}
        onFailed={setImageError}
      />
    );
  if (markdownPreview)
    return (
      <div className="flex-1 min-h-0 overflow-auto">
        <Markdown className="max-w-none p-lg">{file.contents}</Markdown>
      </div>
    );
  return (
    <div className="inkcap-code">
      <EditProvider createEditor={(options) => new Editor(options)}>
        <DiffsFile
          file={file}
          edit
          editorOptions={editorOptions}
          options={{
            disableFileHeader: true,
            overflow: narrow ? "wrap" : "scroll",
            themeType: theme === "mocha" ? "dark" : "light",
            theme: { dark: "catppuccin-mocha", light: "catppuccin-latte" },
          }}
        />
      </EditProvider>
    </div>
  );
}

function ImagePreview({
  path,
  url,
  failed,
  onFailed,
}: {
  path: string;
  url: string;
  failed: boolean;
  onFailed: (failed: boolean) => void;
}): React.JSX.Element {
  const svg = imageMediaType(path) === "image/svg+xml";
  return (
    <div className="inkcap-preview">
      {failed ? (
        <div role="alert">
          <strong>Preview unavailable</strong>
          <span>{path}</span>
        </div>
      ) : (
        <img
          src={url}
          alt={path}
          draggable={svg ? false : undefined}
          onContextMenu={(event) => {
            if (svg) event.preventDefault();
          }}
          onError={() => {
            if (svg) URL.revokeObjectURL(url);
            onFailed(true);
          }}
          onLoad={() => {
            // Keep decoded pixels, not a navigable same-origin SVG document.
            if (svg) URL.revokeObjectURL(url);
            onFailed(false);
          }}
        />
      )}
    </div>
  );
}

function VideoPreview({
  path,
  url,
}: {
  path: string;
  url: string;
}): React.JSX.Element {
  return (
    <div className="inkcap-preview">
      <video src={url} controls aria-label={path} />
    </div>
  );
}

function SaveAsDialog({
  sourceLabel,
  error,
  path,
  selectName,
  downloads,
  open,
  busy,
  pathExists,
  onSubmit,
  onOpenChange,
}: {
  sourceLabel?: string;
  error: string;
  path: string;
  /** Select the file name, not the directory or extension, when focused. */
  selectName: boolean;
  downloads: boolean;
  open: boolean;
  busy: boolean;
  pathExists?: (path: string) => Promise<TargetCheck>;
  onSubmit: (path: string) => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  // The path waiting for a Replace or Cancel, when it names another file.
  const [replacing, setReplacing] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const confirmed = useRef<string | null>(null);
  const reselect = useRef(false);
  const form = useForm({
    defaultValues: { path },
    onSubmit: async ({ value }) => {
      if (confirmed.current !== value.path && pathExists) {
        const found = await pathExists(value.path);
        // The host already told the person the check failed; nothing is
        // saved and the dialog stays open.
        if (found === "unchecked") return;
        if (found === "exists") {
          setReplacing(value.path);
          return;
        }
      }
      confirmed.current = null;
      if (await onSubmit(value.path)) onOpenChange(false);
    },
  });
  const submitting = useSelector(form.store, (state) => state.isSubmitting);
  const formBusy = busy || submitting;
  // Offer the starting path when the dialog opens, never while it is open: a
  // late change to the folder or draft must not replace what the user typed.
  const startPath = useRef(path);
  startPath.current = path;
  useEffect(() => {
    if (!open) return;
    confirmed.current = null;
    setReplacing(null);
    form.setFieldValue("path", startPath.current);
  }, [open]);
  const keepEditing = () => {
    confirmed.current = null;
    reselect.current = true;
    setReplacing(null);
  };
  // Back to the name, selected, once the field is enabled again.
  useEffect(() => {
    if (replacing !== null || !reselect.current) return;
    reselect.current = false;
    const field = input.current;
    if (!field) return;
    field.focus();
    const [start, end] = nameRange(field.value);
    field.setSelectionRange(start, end);
  }, [replacing]);
  const replace = () => {
    confirmed.current = replacing;
    setReplacing(null);
    void form.handleSubmit();
  };
  return (
    <Dialog
      open={open && !(sourceLabel && busy)}
      onOpenChange={(next) => {
        if (!busy) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader className="mb-4">
          <DialogTitle>{downloads ? "Download file" : "Save file"}</DialogTitle>
          <DialogDescription>
            {downloads
              ? "Choose a name for the file. It goes to your Downloads folder."
              : sourceLabel
                ? `Choose a path in ${sourceLabel}.`
                : "Choose where to save it on your Computer."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <form.Field
            name="path"
            validators={{
              onChange: ({ value }) =>
                !value.trim()
                  ? "A file path is required."
                  : value.trim().endsWith("/")
                    ? "Save As needs a file path."
                    : undefined,
            }}
          >
            {(field) => (
              <Field
                label={
                  downloads ? "File name" : sourceLabel ? "Path" : "Location"
                }
                required
                error={field.state.meta.errors[0] ?? error}
              >
                <Input
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      if (!formBusy) void form.handleSubmit();
                    }
                  }}
                  ref={input}
                  autoFocus
                  onFocus={(event) => {
                    if (!selectName) return;
                    const input = event.currentTarget;
                    const [start, end] = nameRange(input.value);
                    input.setSelectionRange(start, end);
                  }}
                  disabled={formBusy || replacing !== null}
                  required
                />
              </Field>
            )}
          </form.Field>
          {replacing !== null ? (
            <>
              <Alert
                tone="warning"
                role="alert"
                title={`${leafOf(replacing)} already exists. Replace it?`}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={keepEditing}>
                  Cancel
                </Button>
                <Button type="button" onClick={replace}>
                  Replace
                </Button>
              </DialogFooter>
            </>
          ) : (
            <DialogFooter>
              <DialogClose disabled={formBusy}>Cancel</DialogClose>
              <Button
                type="button"
                disabled={formBusy}
                onClick={() => {
                  void form.handleSubmit();
                }}
              >
                {downloads
                  ? formBusy
                    ? "Downloading…"
                    : "Download"
                  : formBusy
                    ? "Saving…"
                    : "Save"}
              </Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
