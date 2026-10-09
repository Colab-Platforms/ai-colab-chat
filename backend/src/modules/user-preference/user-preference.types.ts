export const MAX_CONTEXT_ITEMS = 10;
export const MAX_CONTEXT_ITEM_LENGTH = 300;

export interface UpdatePreferencesBody {
  enableFollowUpQuestions?: boolean;
  voiceId?: string | null;
}
