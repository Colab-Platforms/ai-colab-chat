import { ModelCapability } from "@prisma/client";

export interface CreateModelBody {
  name: string;
  modelProviderId: number;
  externalId: string;
  capabilities: ModelCapability[];
  description?: string;
  isActive?: boolean;
  defaultForCapabilities?: ModelCapability[];
  tokenMultiplier?: number;
  videoCostPerSecond?: number;
  creditCostPerSecond?: number;
}

export interface UpdateModelBody {
  name?: string;
  modelProviderId?: number;
  externalId?: string;
  capabilities?: ModelCapability[];
  description?: string;
  isActive?: boolean;
  defaultForCapabilities?: ModelCapability[];
  tokenMultiplier?: number;
  videoCostPerSecond?: number;
  creditCostPerSecond?: number;
}
