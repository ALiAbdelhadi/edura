/**
 * Thin re-export shim. The Cloudinary client now lives in @repo/server-core so
 * apps/www and apps/superadmin share one signed implementation (drift-critical
 * code lives there exactly once). Existing callers keep their import path.
 */
export {
  isCloudinaryConfigured,
  cloudName,
  uploadBuffer,
  generateSignedUrl,
  deleteResource,
  publicIdFromUrl,
  type CloudinaryResourceType,
  type UploadOptions,
  type UploadedAsset,
} from "@repo/server-core/media/cloudinary";
