/** Installation repositories do not depend on the selected Computer. */
export const repositoryKeys = {
  all: (surfaceId: string, repository: string) =>
    ["inkcap-repository", surfaceId, repository] as const,
  branch: (surfaceId: string, repository: string, branch: string) =>
    [...repositoryKeys.all(surfaceId, repository), branch] as const,
};
