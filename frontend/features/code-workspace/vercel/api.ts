import api from "@/lib/api";
import type { VercelDeploymentDto, VercelDetectDto, VercelLinkDto, VercelStatusDto } from "./types";

// REST calls for backend/src/modules/vercel (mounted at /api/vercel).
// Same { status, data, message } envelope as the rest of the app.
// The three streaming endpoints (deploy, redeploy, logs) live in deployStream.ts —
// axios can't read a response body incrementally in the browser.

export const vercelApi = {
  getStatus: (projectId?: number) =>
    api
      .get<{ data: VercelStatusDto }>("/vercel/status", { params: projectId ? { projectId } : undefined })
      .then((r) => r.data.data),

  getInstallUrl: (projectId?: number) =>
    api
      .get<{ data: { url: string } }>("/vercel/install-url", { params: projectId ? { projectId } : undefined })
      .then((r) => r.data.data.url),

  disconnect: () => api.delete("/vercel/connection"),

  getLink: (projectId: number) =>
    api.get<{ data: VercelLinkDto | null }>(`/vercel/projects/${projectId}`).then((r) => r.data.data),

  detect: (projectId: number, source: "files" | "git") =>
    api
      .get<{ data: VercelDetectDto }>(`/vercel/projects/${projectId}/detect`, { params: { source } })
      .then((r) => r.data.data),

  listDeployments: (projectId: number) =>
    api
      .get<{ data: { deployments: VercelDeploymentDto[] } }>(`/vercel/projects/${projectId}/deployments`)
      .then((r) => r.data.data.deployments),

  cancel: (projectId: number, deploymentId: string) =>
    api.post(`/vercel/projects/${projectId}/deploy/${encodeURIComponent(deploymentId)}/cancel`),

  /** Deletes only our link — the Vercel project and the live site stay. */
  unlinkProject: (projectId: number) => api.delete(`/vercel/projects/${projectId}/link`),
};
