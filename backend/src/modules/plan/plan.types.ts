export interface CreatePlanBody {
    name: string;
    monthlyPrice: number;
    quarterlyPrice: number;
    yearlyPrice: number;
    tokenLimit: number;
    features: any;
    isActive?: boolean;
    restrictToFreeModels?: boolean;
    documentGenEnabled?: boolean;
    imageGenEnabled?: boolean;
    videoGenEnabled?: boolean;
    monthlyVideoCredits?: number;
    allowedVideoModelIds?: number[];
}

export interface UpdatePlanBody {
    name?: string;
    monthlyPrice?: number;
    quarterlyPrice?: number;
    yearlyPrice?: number;
    tokenLimit?: number;
    features?: any;
    isActive?: boolean;
    restrictToFreeModels?: boolean;
    documentGenEnabled?: boolean;
    imageGenEnabled?: boolean;
    videoGenEnabled?: boolean;
    monthlyVideoCredits?: number;
    allowedVideoModelIds?: number[];
}
