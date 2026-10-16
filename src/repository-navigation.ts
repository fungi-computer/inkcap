import type { AppContext } from "@fungi.computer/agar";
import { readFilesLocation } from "@fungi.computer/agar/roles/files";

/**
 * A files-role navigate intent naming a repository selects one repository
 * file. Params outside the files role grammar are refused as "invalid" so a
 * bad link cannot crash the editor; intents without a repository stay
 * Computer navigation.
 */
export function repositoryLocation(request: AppContext["openRequest"]) {
  if (request?.kind !== "navigate") return null;
  if (!request.params.some(({ key }) => key === "repository")) return null;
  const location = readFilesLocation(request.params);
  if (location === null || !("repository" in location)) return "invalid";
  return {
    repository: location.repository,
    initialBranch: location.branch,
    initialPath: location.path,
    openRequestId: request.requestId,
  };
}
