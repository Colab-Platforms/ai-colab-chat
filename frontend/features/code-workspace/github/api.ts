import api from "@/lib/api";
import type {
  GithubLinkDto,
  GithubPullResultDto,
  GithubPushResultDto,
  GithubRepoDto,
  GithubStatusDto,
} from "./types";

// REST calls for backend/src/modules/github (mounted at /api/github).
// Same { status, data, message } envelope as the rest of the app.

export const githubApi = {
  getStatus: (projectId?: number) =>
    api
      .get<{ data: GithubStatusDto }>("/github/status", { params: projectId ? { projectId } : undefined })
      .then((r) => r.data.data),

  getInstallUrl: (projectId?: number) =>
    api
      .get<{ data: { url: string } }>("/github/install-url", { params: projectId ? { projectId } : undefined })
      .then((r) => r.data.data.url),

  disconnect: () => api.delete("/github/connection"),

  listRepos: (q: string) =>
    api
      .get<{ data: { repos: GithubRepoDto[]; total: number } }>("/github/repos", { params: q ? { q } : undefined })
      .then((r) => r.data.data),

  createRepo: (input: { name: string; description: string; isPrivate: boolean }) =>
    api.post<{ data: GithubRepoDto }>("/github/repos", input).then((r) => r.data.data),

  linkProject: (
    projectId: number,
    input: { owner: string; repo: string; initial: "push" | "pull"; overwrite?: boolean },
  ) =>
    api
      .post<{
        data: { link: GithubLinkDto; push: GithubPushResultDto | null; pull: GithubPullResultDto | null };
      }>(`/github/projects/${projectId}/link`, input)
      .then((r) => r.data.data),

  unlinkProject: (projectId: number) => api.delete(`/github/projects/${projectId}/link`),

  setAutoPush: (projectId: number, autoPush: boolean) =>
    api.patch(`/github/projects/${projectId}/auto-push`, { autoPush }),

  /** `message` is the user's own commit message; blank/absent lets the server generate one. */
  push: (projectId: number, force = false, message = "") =>
    api
      .post<{ data: GithubPushResultDto }>(`/github/projects/${projectId}/push`, { force, message })
      .then((r) => r.data.data),

  pull: (projectId: number) =>
    api.post<{ data: GithubPullResultDto }>(`/github/projects/${projectId}/pull`).then((r) => r.data.data),
};
