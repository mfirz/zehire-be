/**
 * CV Service
 * ==========
 * Handles CV/resume file uploads, downloads, and deletion.
 * Files are stored in Cloudflare R2.
 */

import { customAlphabet } from "nanoid";
import type { ApplicationRepository } from "./repository";

// Alphanumeric nanoid for file paths
const fileId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  12
);

// =============================================================================
// CONSTANTS
// =============================================================================

/** Allowed MIME types for CV uploads */
export const ALLOWED_CV_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

/** Human-readable type names */
export const CV_TYPE_NAMES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

/** Maximum file size: 5MB */
export const MAX_CV_SIZE = 5 * 1024 * 1024;

/** File extensions by MIME type */
const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// =============================================================================
// TYPES
// =============================================================================

export interface CvUploadResult {
  path: string;
  filename: string;
  size: number;
  contentType: string;
}

export interface CvValidationError {
  code: "INVALID_TYPE" | "FILE_TOO_LARGE" | "NO_FILE";
  message: string;
}

// =============================================================================
// SERVICE
// =============================================================================

export class CvService {
  constructor(
    private bucket: R2Bucket,
    private repository: ApplicationRepository
  ) {}

  /**
   * Validate a CV file before upload.
   */
  validateFile(file: File | null): CvValidationError | null {
    if (!file) {
      return {
        code: "NO_FILE",
        message: "No file provided",
      };
    }

    if (!ALLOWED_CV_TYPES.includes(file.type as typeof ALLOWED_CV_TYPES[number])) {
      return {
        code: "INVALID_TYPE",
        message: `Invalid file type. Allowed: ${Object.values(CV_TYPE_NAMES).join(", ")}`,
      };
    }

    if (file.size > MAX_CV_SIZE) {
      const maxMB = MAX_CV_SIZE / (1024 * 1024);
      return {
        code: "FILE_TOO_LARGE",
        message: `File too large. Maximum size: ${maxMB}MB`,
      };
    }

    return null;
  }

  /**
   * Upload a CV file for an application.
   */
  async upload(applicationId: string, file: File): Promise<CvUploadResult> {
    // Validate
    const error = this.validateFile(file);
    if (error) {
      throw new Error(error.message);
    }

    // Generate unique path
    const ext = EXTENSIONS[file.type] || "pdf";
    const uniqueId = fileId();
    const path = `cvs/${applicationId}/${uniqueId}.${ext}`;

    // Upload to R2
    await this.bucket.put(path, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Update database
    await this.repository.updateCv(applicationId, path, file.name);

    return {
      path,
      filename: file.name,
      size: file.size,
      contentType: file.type,
    };
  }

  /**
   * Get a CV file from R2.
   * Returns the R2 object for streaming.
   */
  async get(cvPath: string): Promise<R2ObjectBody | null> {
    const object = await this.bucket.get(cvPath);
    return object;
  }

  /**
   * Delete a CV file from R2 and update the database.
   */
  async delete(applicationId: string, cvPath: string): Promise<void> {
    // Delete from R2
    await this.bucket.delete(cvPath);

    // Update database
    await this.repository.removeCv(applicationId);
  }

  /**
   * Check if a CV exists in R2.
   */
  async exists(cvPath: string): Promise<boolean> {
    const object = await this.bucket.head(cvPath);
    return object !== null;
  }
}
