export interface CreateChatBody {
  title?: string;
  folderId?: number;
  assistantId?: number | null;
  modelIds?: number[];
  capability?: string;
  websiteTemplateId?: number | null;
}

export interface UpdateChatContextsBody {
  contextIds: number[];
}
