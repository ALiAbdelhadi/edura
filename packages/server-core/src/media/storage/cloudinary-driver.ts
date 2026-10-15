import {
  deleteResource,
  generateSignedUrl,
  isCloudinaryConfigured,
  publicIdFromUrl,
  uploadBuffer,
} from "../cloudinary";
import type { MediaImageFit, MediaStorageDriver } from "./types";

export function cloudinaryTransformation(fit: MediaImageFit): string {
  const quality = fit.quality === "good" ? ",q_auto:good" : "";
  return `c_limit,w_${fit.maxWidth},h_${fit.maxHeight}${quality}`;
}

export const cloudinaryDriver: MediaStorageDriver = {
  name: "cloudinary",
  uploadsEnabled: () => isCloudinaryConfigured(),
  upload: (buffer, { fit, ...rest }) =>
    uploadBuffer(buffer, fit ? { ...rest, transformation: cloudinaryTransformation(fit) } : rest),
  destroy: (publicId, resourceType) => deleteResource(publicId, resourceType),
  signedUrl: (publicId, opts) => generateSignedUrl(publicId, opts),
  publicIdFromUrl: (url) => publicIdFromUrl(url),
};
