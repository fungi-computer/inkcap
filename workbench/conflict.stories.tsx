import type { StoryDefault } from "@ladle/react";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@fungi.computer/agar/query";
import { InkcapApp } from "../src/InkcapApp.js";
import { createInkcapFixture, projectPath } from "./fixtures.js";
import "./workbench.css";
export default { title: "Conflict" } satisfies StoryDefault;
export const FirstVisit = () => <ConflictStudy bom={false} />;
export const BomLineEndings = () => <ConflictStudy bom />;

function ConflictStudy({ bom }: { bom: boolean }) {
  const [fixture] = useState(() => {
    const value = createInkcapFixture("workspace");
    if (bom)
      value.files.set(
        `${projectPath}/src/garden.ts`,
        '\uFEFF// Original heading\r\nexport const shared = "unchanged";\r\nexport function readShared() {\r\n  return shared;\r\n}\r\n',
      );
    return value;
  });
  const [client] = useState(createQueryClient);
  useEffect(
    () => () => {
      client.clear();
    },
    [client],
  );
  const [stored, setStored] = useState("");
  const path = `${projectPath}/src/garden.ts`;
  return (
    <div className="inkcap-study">
      <div className="inkcap-study-note">
        <span>Local Computer fixture · no preopened files</span>
        <button
          type="button"
          onClick={() => {
            fixture.files.set(
              path,
              bom
                ? '\uFEFF// Computer heading\r\nexport const shared = "unchanged";\r\nexport function readShared() {\r\n  return shared;\r\n}\r\n'
                : "// External writer revision\n",
            );
          }}
        >
          External edit
        </button>
        <button
          type="button"
          onClick={() => {
            setStored(fixture.files.get(path) ?? "missing");
          }}
        >
          Inspect stored file
        </button>
        <output aria-label="Stored fixture file">{stored}</output>
      </div>
      <div className="inkcap-study-surface">
        <QueryClientProvider client={client}>
          <InkcapApp
            connection={fixture.connection}
            context={{
              computerId: fixture.computerId,
              computerName: "Workbench",
              projectPath,
            }}
          />
        </QueryClientProvider>
      </div>
    </div>
  );
}
