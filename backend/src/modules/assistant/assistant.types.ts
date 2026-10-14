export interface CreateAssistantBody {
  name: string;
  description?: string;
  icon?: string;
  kind?: "SPECIALIST" | "AGENT";
  bgFrom?: string | null;
  bgVia?: string | null;
  bgTo?: string | null;
  bgFromDark?: string | null;
  bgViaDark?: string | null;
  bgToDark?: string | null;
  systemPrompt: string;
  defaultModelId?: number | null;
  temperature?: number;
  suggestedPrompts?: string[] | null;
}

export interface UpdateAssistantBody {
  name?: string;
  description?: string;
  icon?: string;
  kind?: "SPECIALIST" | "AGENT";
  bgFrom?: string | null;
  bgVia?: string | null;
  bgTo?: string | null;
  bgFromDark?: string | null;
  bgViaDark?: string | null;
  bgToDark?: string | null;
  systemPrompt?: string;
  defaultModelId?: number | null;
  temperature?: number;
  suggestedPrompts?: string[] | null;
  isActive?: boolean;
}
