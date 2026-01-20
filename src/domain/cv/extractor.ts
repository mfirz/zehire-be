/**
 * CV Text Extractor
 * =================
 * Extracts text content from PDF and DOCX files.
 *
 * Uses:
 * - unpdf for PDF extraction (Cloudflare Workers compatible)
 * - mammoth for DOCX extraction
 */

import { extractText } from "unpdf";
import mammoth from "mammoth";

// =============================================================================
// TYPES
// =============================================================================

export interface ExtractionResult {
  success: boolean;
  text: string | null;
  pageCount?: number;
  error?: string;
  format: "pdf" | "docx" | "doc" | "unknown";
}

// =============================================================================
// FILE FORMAT DETECTION
// =============================================================================

/**
 * Detect file format from filename and/or magic bytes.
 */
export function detectFormat(
  filename: string,
  buffer?: ArrayBuffer
): "pdf" | "docx" | "doc" | "unknown" {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc";

  // Check magic bytes if buffer provided
  if (buffer && buffer.byteLength >= 4) {
    const bytes = new Uint8Array(buffer.slice(0, 4));

    // PDF magic: %PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return "pdf";
    }

    // DOCX magic: PK (ZIP)
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      return "docx";
    }

    // DOC magic: D0 CF 11 E0 (Compound File Binary)
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      return "doc";
    }
  }

  return "unknown";
}

// =============================================================================
// PDF EXTRACTION
// =============================================================================

/**
 * Extract text from a PDF file.
 *
 * Uses unpdf which is compatible with Cloudflare Workers.
 */
async function extractFromPDF(buffer: ArrayBuffer): Promise<ExtractionResult> {
  try {
    const result = await extractText(buffer, { mergePages: true });

    // Check if text was extracted
    const text = result.text?.trim() ?? "";

    if (!text || text.length < 10) {
      return {
        success: false,
        text: null,
        format: "pdf",
        error: "No text could be extracted. The PDF may be scanned/image-based.",
      };
    }

    return {
      success: true,
      text,
      pageCount: result.totalPages,
      format: "pdf",
    };
  } catch (error) {
    return {
      success: false,
      text: null,
      format: "pdf",
      error: `PDF extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// =============================================================================
// DOCX EXTRACTION
// =============================================================================

/**
 * Extract text from a DOCX file.
 *
 * Uses mammoth for conversion to plain text.
 */
async function extractFromDOCX(buffer: ArrayBuffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });

    const text = result.value?.trim() ?? "";

    if (!text || text.length < 10) {
      return {
        success: false,
        text: null,
        format: "docx",
        error: "No text could be extracted from the DOCX file.",
      };
    }

    // Log any warnings
    if (result.messages && result.messages.length > 0) {
      console.warn("[CV Extractor] DOCX warnings:", result.messages);
    }

    return {
      success: true,
      text,
      format: "docx",
    };
  } catch (error) {
    return {
      success: false,
      text: null,
      format: "docx",
      error: `DOCX extraction failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// =============================================================================
// MAIN EXTRACTION FUNCTION
// =============================================================================

/**
 * Extract text from a CV file.
 *
 * Supports PDF and DOCX formats.
 * DOC format is not supported (legacy binary format).
 *
 * @param buffer - File content as ArrayBuffer
 * @param filename - Original filename (used for format detection)
 * @returns Extraction result with text or error
 */
export async function extractTextFromCV(
  buffer: ArrayBuffer,
  filename: string
): Promise<ExtractionResult> {
  const format = detectFormat(filename, buffer);

  switch (format) {
    case "pdf":
      return extractFromPDF(buffer);

    case "docx":
      return extractFromDOCX(buffer);

    case "doc":
      return {
        success: false,
        text: null,
        format: "doc",
        error: "Legacy .doc format is not supported. Please upload a .docx or .pdf file.",
      };

    default:
      return {
        success: false,
        text: null,
        format: "unknown",
        error: "Unsupported file format. Please upload a PDF or DOCX file.",
      };
  }
}
