export type KnowledgeSourceTypeName =
  | "DOCUMENT"
  | "PAST_POST"
  | "PRODUCT_DOC"
  | "COMPETITOR"
  | "NOTE";

export interface RetrieveParams {
  userId: number;
  folderId?: number | null;
  query: string;
  k?: number;
  types?: KnowledgeSourceTypeName[];
  /** JSONB containment filter applied to chunk metadata, e.g. {platform:"instagram"} */
  metadata?: Record<string, unknown>;
}

export interface RetrievedChunk {
  id: number;
  sourceId: number;
  sourceTitle: string;
  sourceType: KnowledgeSourceTypeName;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}
