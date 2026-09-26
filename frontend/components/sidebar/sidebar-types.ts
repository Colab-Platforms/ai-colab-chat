export interface Assistant {
  id: number;
  name: string;
  description?: string | null;
  icon: string;
  bgFrom?: string | null;
  bgVia?: string | null;
  bgTo?: string | null;
  bgFromDark?: string | null;
  bgViaDark?: string | null;
  bgToDark?: string | null;
  isActive: boolean;
}

export interface Chat {
  id: number;
  title: string | null;
  folderId: number | null;
  isArchived: boolean;
  isPinned: boolean;
  updatedAt: string;
  assistantId?: number | null;
  assistant?: { id: number; name: string; icon: string } | null;
}

export interface FolderItem {
  id: number;
  name: string;
  description?: string | null;
  _count?: { chats: number };
}
