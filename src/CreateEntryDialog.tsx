import { Schema } from "effect";
import { Button } from "@fungi.computer/caps/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@fungi.computer/caps/components/dialog";
import { FormFooter } from "@fungi.computer/caps/components/field";
import {
  SchemaForm,
  field,
  useSchemaForm,
  useSchemaFormStatus,
} from "@fungi.computer/caps/form";

export type EntryLocation = { kind: "file" | "folder"; directory: string };
const entryName = Schema.Trim.check(
  Schema.isPattern(/^(?!\.{1,2}$)[^/]+$/u, {
    message: "Enter a single file or folder name.",
  }),
);
const entryFields = {
  file: Schema.Struct({
    name: entryName.annotate(field({ label: "File name" })),
  }),
  folder: Schema.Struct({
    name: entryName.annotate(field({ label: "Folder name" })),
  }),
};

export type CreateEntryDialogProps = {
  creation: EntryLocation | null;
  rootPath: string;
  onCreate: (
    creation: EntryLocation,
    name: string,
  ) => Promise<string | undefined>;
  onClose: () => void;
};

export function CreateEntryDialog(props: CreateEntryDialogProps) {
  return (
    <EntryDialog
      key={
        props.creation
          ? `${props.creation.kind}:${props.creation.directory}`
          : "closed"
      }
      {...props}
    />
  );
}

function EntryDialog({
  creation,
  rootPath,
  onCreate,
  onClose,
}: CreateEntryDialogProps) {
  const model = useSchemaForm({
    schema: entryFields[creation?.kind ?? "file"],
    defaultValues: { name: "" },
    onSubmit: async (value) => {
      if (!creation) return undefined;
      const failure = await onCreate(creation, value.name);
      if (failure) {
        return failure === "That name already exists in this directory."
          ? { kind: "refused", fields: { name: failure } }
          : { kind: "refused", error: failure };
      }
      onClose();
      return undefined;
    },
  });
  const { submitting } = useSchemaFormStatus(model);
  return (
    <Dialog
      open={creation !== null}
      onOpenChange={(open) => {
        if (!open && !model.form.state.isSubmitting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            New {creation?.kind === "folder" ? "folder" : "file"}
          </DialogTitle>
          <DialogDescription>
            Create in {creation?.directory ?? rootPath} on this Computer.
          </DialogDescription>
        </DialogHeader>
        <SchemaForm
          model={model}
          onSubmitCapture={() => {
            // Revalidate the current name on retry, including a field refusal.
            if (!model.form.state.isSubmitting)
              model.form.setFieldValue("name", (name) => name);
          }}
          footer={
            <FormFooter divider={false} error={model.error}>
              <Button
                variant="ghost"
                type="button"
                disabled={submitting}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} loading={submitting}>
                {submitting ? "Creating…" : "Create"}
              </Button>
            </FormFooter>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
