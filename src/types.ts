import { z } from 'zod';

// --- Database Interfaces ---

export interface Channel {
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeVersion {
  version: string;
  minAppVersion: string | null;
  createdAt: string;
  deprecatedAt: string | null;
}

export interface Release {
  id: string;
  runtimeVersion: string;
  platform: 'ios' | 'android';
  channel: string;
  gitCommit: string | null;
  gitBranch: string | null;
  message: string | null;
  isActive: boolean; // Drizzle handles boolean mode
  isRollback: boolean;
  rollbackFromId: string | null;
  bundlePath: string;
  manifestJson: string;
  createdAt: string;
  activatedAt: string | null;
  deactivatedAt: string | null;
}

export interface Asset {
  hash: string;
  filePath: string;
  contentType: string;
  fileExtension: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ReleaseAsset {
  releaseId: string;
  assetHash: string;
  assetKey: string;
  isLaunchAsset: boolean;
}

// --- Expo Protocol Interfaces ---

export interface ExpoManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: ExpoAsset;
  assets: ExpoAsset[];
  metadata: Record<string, any>;
  extra: {
    expoClient?: Record<string, any>;
  };
}

export interface ExpoAsset {
  key: string;
  hash: string;
  fileExtension: string;
  contentType: string;
  url: string;
}

// --- Zod Schemas for API Requests ---

export const UploadReleaseSchema = z.object({
  runtimeVersion: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  channel: z.string().default('production'),
  gitCommit: z.string().optional(),
  gitBranch: z.string().optional(),
  message: z.string().optional(),
});
// Note: 'bundle' file handling is done via multer, verified separately

export const CreateChannelSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/).min(1).max(50),
  description: z.string().optional(),
});

export const UpdateReleaseStatusSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'rollback']),
});

// --- API Response Types ---

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}
