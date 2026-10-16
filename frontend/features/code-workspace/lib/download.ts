import { codeWorkspaceApi } from "../api";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

export function downloadFile(path: string, content: string) {
  saveBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), path.split("/").pop() || "file.txt");
}

/** Zips the files client-side — everything is already in memory (or one fetch away). */
export async function downloadProjectZip(title: string, files: { path: string; content: string }[]) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folder = zip.folder(slug(title))!;
  for (const f of files) folder.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  saveBlob(blob, `${slug(title)}.zip`);
}

/** For the chat card, when the project is not the one loaded in the panel. */
export async function downloadProjectZipById(projectId: number) {
  const dto = await codeWorkspaceApi.getProject(projectId);
  await downloadProjectZip(dto.title, dto.files);
}
