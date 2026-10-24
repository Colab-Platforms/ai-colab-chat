/** A row from GET /website-templates, shared by the gallery, the modal and the composer chip. */
export interface WebsiteTemplate {
  id: number;
  name: string;
  description: string;
  previewUrl: string;
  thumbnailUrl: string;
  techStack: string[];
  category: string | null;
  /** Only present on the admin listing; the gallery never reads it. */
  prompt?: string;
  modelId: number | null;
  model?: { id: number; name: string } | null;
  isActive?: boolean;
  sortOrder?: number;
  usageCount?: number;
}
