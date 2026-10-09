export interface CreateFolderBody {
    name: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
}

export interface UpdateFolderBody {
    name: string;
    description?: string | null;
    icon?: string | null;
    color?: string | null;
}
