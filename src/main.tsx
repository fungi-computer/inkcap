import { Schema } from "effect";
import { createElement } from "react";
import { createQueryClient } from "@fungi.computer/agar/query";
import { mountApp } from "@fungi.computer/agar/react";
import "./inkcap.css";
import "@fungi.computer/caps/fonts.css";
import { InkcapEntry } from "./InkcapEntry.js";
import { projectPathFor } from "./computer-home.js";

const root = document.getElementById("inkcap-root");
if (!root) throw new Error("Inkcap root is missing");
const params = new URLSearchParams(window.location.search);
const location = Schema.decodeUnknownSync(
  Schema.Struct({
    project: Schema.NullOr(Schema.String),
    computerName: Schema.NullOr(Schema.String),
  }),
)({ project: params.get("project"), computerName: params.get("computerName") });
mountApp(
  root,
  { name: "Inkcap", queryClient: createQueryClient() },
  ({ app }) =>
    createElement(InkcapEntry, {
      app,
      computerName: location.computerName,
      projectPath: projectPathFor(location.project),
    }),
);
