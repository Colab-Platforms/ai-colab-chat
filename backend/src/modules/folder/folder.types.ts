export interface CreateFolderBody {
    name: string;
    description?: string | null;
}

export interface UpdateFolderBody {
    name: string;
    description?: string | null;
}
