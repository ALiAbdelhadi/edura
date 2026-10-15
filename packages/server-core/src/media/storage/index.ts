import { isCloudinaryConfigured } from "../cloudinary";
import { cloudinaryDriver } from "./cloudinary-driver";
import { mockMediaDriver } from "./mock-driver";
import type { MediaStorageDriver } from "./types";
import { isMockMediaExplicit, mediaMode } from "./types";

export type {
  MediaStorageDriver,
  MediaMode,
  MediaResourceType,
  MediaDeliveryType,
  MediaUploadOptions,
  MediaImageFit,
  StoredMedia,
  DeleteOutcome,
} from "./types";
export { __resetMockMediaForTests } from "./mock-driver";

export function currentMediaMode() {
  return mediaMode(isCloudinaryConfigured());
}

export function resolveMediaDriver(): MediaStorageDriver {
  if (currentMediaMode() === "cloudinary") return cloudinaryDriver;
  if (isMockMediaExplicit() && process.env.NODE_ENV === "production") {
    throw new Error("MEDIA_MODE=mock is not allowed in production — set MEDIA_MODE=cloudinary");
  }
  return mockMediaDriver;
}
