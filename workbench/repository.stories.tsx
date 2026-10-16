import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@fungi.computer/agar/query";
import type { StoryDefault } from "@ladle/react";
import type { AppStatusItem } from "@fungi.computer/agar";
import { InkcapEntry } from "../src/InkcapEntry.js";
import { createRepositoryFixture } from "./repository-fixture.js";
import "./workbench.css";

export default { title: "Inkcap Bonsai" } satisfies StoryDefault;
export function Repository() {
  return <RepositoryStudy />;
}
export function Rebuilding() {
  return <RepositoryStudy holdCopyRebuild />;
}
export function PushDuringSave() {
  return <RepositoryStudy holdCommitAcknowledgement />;
}
export function HostWithoutAppCalls() {
  return <RepositoryStudy appCalls={false} />;
}
function RepositoryStudy({
  holdCommitAcknowledgement = false,
  holdCopyRebuild = false,
  appCalls = true,
}: {
  holdCommitAcknowledgement?: boolean;
  holdCopyRebuild?: boolean;
  appCalls?: boolean;
}) {
  const [client] = useState(createQueryClient);
  const [status, setStatus] = useState<readonly AppStatusItem[]>([]);
  const [fixture] = useState(() =>
    createRepositoryFixture({
      holdCommitAcknowledgement,
      holdCopyRebuild,
      appCalls,
      status: {
        reportStatus: (items) => {
          setStatus(items);
          return Promise.resolve();
        },
        onStatusAction: () => () => undefined,
      },
    }),
  );
  useEffect(() => fixture.installKeys(document.body), [fixture]);
  useEffect(
    () => () => {
      client.clear();
    },
    [client],
  );
  return (
    <div className="inkcap-study">
      <div className="inkcap-study-note">
        <span>Inkcap · Bonsai editor · controlled method responses</span>
        <button
          onClick={() => {
            void fixture.push();
          }}
        >
          Agent pushes moss
        </button>
        <button
          onClick={() => {
            fixture.navigate("README.md");
          }}
        >
          Bonsai opens README.md
        </button>
        {holdCopyRebuild && (
          <button onClick={fixture.acknowledgeRebuild}>
            Finish rebuilding
          </button>
        )}
        {holdCommitAcknowledgement ? (
          <button onClick={fixture.acknowledgeCommit}>
            Acknowledge the commit
          </button>
        ) : null}
        <output aria-label="Host window status">
          {status.map((item) => (
            <span key={item.id}>{item.text} </span>
          ))}
        </output>
      </div>
      <div className="inkcap-study-surface">
        <QueryClientProvider client={client}>
          <InkcapEntry
            app={fixture.connection.app}
            computerName={null}
            projectPath="/"
          />
        </QueryClientProvider>
      </div>
    </div>
  );
}
