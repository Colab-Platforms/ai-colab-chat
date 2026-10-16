import api from "@/lib/api";
import type { CodeProjectDto, CodeVersionDto } from "./types";

// REST calls for backend/src/modules/code-workspace (mounted at /api/code-projects).
// All responses use the app-wide { status, data, message } envelope.

export const codeWorkspaceApi = {
  getProject: (id: number) =>
    api.get<{ data: CodeProjectDto }>(`/code-projects/${id}`).then((r) => r.data.data),

  renameProject: (id: number, title: string) => api.patch(`/code-projects/${id}`, { title }),

  saveFile: (id: number, path: string, content: string) =>
    api.put(`/code-projects/${id}/files`, { path, content }),

  deleteFile: (id: number, path: string) => api.post(`/code-projects/${id}/files/delete`, { path }),

  renameFile: (id: number, from: string, to: string) =>
    api.post(`/code-projects/${id}/files/rename`, { from, to }),

  listVersions: (id: number) =>
    api.get<{ data: CodeVersionDto[] }>(`/code-projects/${id}/versions`).then((r) => r.data.data),

  restoreVersion: (id: number, version: number) =>
    api
      .post<{ data: CodeProjectDto }>(`/code-projects/${id}/versions/${version}/restore`)
      .then((r) => r.data.data),
};
