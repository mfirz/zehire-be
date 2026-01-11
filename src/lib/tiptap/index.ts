/**
 * Tiptap Utilities
 * ================
 * Validation, text extraction, and HTML rendering for Tiptap documents.
 *
 * Security-focused implementation with:
 * - Strict node/mark allowlists
 * - Depth and size limits
 * - Safe link validation (https only)
 * - Pure JS HTML rendering (no DOM, works in Cloudflare Workers)
 */

import { z } from "zod";

import {
  ALLOWED_MARKS,
  ALLOWED_NODES,
  TIPTAP_LIMITS,
  type AllowedNodeType,
  type TiptapDoc,
  type TiptapMark,
  type TiptapNode,
} from "./types";

// Re-export types
export * from "./types";

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

/**
 * Schema for link href validation.
 * Only allows http/https URLs to prevent javascript: and data: XSS.
 */
const SafeHrefSchema = z
  .string()
  .regex(/^https?:\/\//i, "Links must use http:// or https://")
  .optional();

/**
 * Schema for Tiptap mark (formatting).
 */
const TiptapMarkSchema = z.object({
  type: z.enum(ALLOWED_MARKS),
  attrs: z
    .object({
      href: SafeHrefSchema,
      target: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

/**
 * Schema for Tiptap node (recursive).
 * Uses lazy() for self-reference.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TiptapNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum(ALLOWED_NODES),
    content: z.array(TiptapNodeSchema).max(TIPTAP_LIMITS.maxChildrenPerNode).optional(),
    text: z.string().max(TIPTAP_LIMITS.maxTextPerNode).optional(),
    marks: z.array(TiptapMarkSchema).optional(),
    attrs: z.record(z.unknown()).optional(),
  })
);

/**
 * Schema for Tiptap document (root).
 */
export const TiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(TiptapNodeSchema),
});

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate depth of document structure.
 * Prevents deeply nested content that could cause stack overflow.
 */
export function validateDepth(
  node: TiptapNode | TiptapDoc,
  maxDepth: number,
  currentDepth = 0
): boolean {
  if (currentDepth > maxDepth) {
    return false;
  }

  if (node.content) {
    for (const child of node.content) {
      if (!validateDepth(child, maxDepth, currentDepth + 1)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate a Tiptap document with all safety checks.
 * Returns the validated document or throws ZodError.
 */
export function validateTiptapDoc(doc: unknown): TiptapDoc {
  // Parse basic structure
  const parsed = TiptapDocSchema.parse(doc) as TiptapDoc;

  // Check depth
  if (!validateDepth(parsed, TIPTAP_LIMITS.maxDepth)) {
    throw new Error(`Document exceeds maximum nesting depth of ${TIPTAP_LIMITS.maxDepth}`);
  }

  // Check JSON size
  const jsonSize = JSON.stringify(parsed).length;
  if (jsonSize > TIPTAP_LIMITS.maxJsonSize) {
    throw new Error(
      `Document JSON size exceeds maximum of ${TIPTAP_LIMITS.maxJsonSize} characters`
    );
  }

  return parsed;
}

// =============================================================================
// TEXT EXTRACTION
// =============================================================================

/**
 * Extract plain text from a Tiptap document.
 * Used for LLM processing and content length validation.
 */
export function extractPlainText(doc: TiptapDoc): string {
  const parts: string[] = [];

  function extractFromNode(node: TiptapNode): void {
    // Text node - add the text
    if (node.type === "text" && node.text) {
      parts.push(node.text);
      return;
    }

    // Hard break - add newline
    if (node.type === "hardBreak") {
      parts.push("\n");
      return;
    }

    // Horizontal rule - add newline
    if (node.type === "horizontalRule") {
      parts.push("\n---\n");
      return;
    }

    // Recurse into children
    if (node.content) {
      for (const child of node.content) {
        extractFromNode(child);
      }
    }

    // Add newline after block elements
    if (isBlockNode(node.type)) {
      parts.push("\n");
    }
  }

  // Process all top-level nodes
  for (const node of doc.content) {
    extractFromNode(node);
  }

  // Clean up: trim and collapse multiple newlines
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Check if a node type is a block element.
 */
function isBlockNode(type: AllowedNodeType): boolean {
  return [
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "codeBlock",
  ].includes(type);
}

// =============================================================================
// HTML RENDERING (Pure JS - no DOM dependencies)
// =============================================================================

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render marks (formatting) as opening HTML tags.
 */
function renderMarksOpen(marks?: TiptapMark[]): string {
  if (!marks || marks.length === 0) return "";

  return marks
    .map((mark) => {
      switch (mark.type) {
        case "bold":
          return "<strong>";
        case "italic":
          return "<em>";
        case "underline":
          return "<u>";
        case "strike":
          return "<s>";
        case "code":
          return "<code>";
        case "link": {
          const href = mark.attrs?.href;
          if (href && /^https?:\/\//i.test(href)) {
            return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
          }
          return "<span>";
        }
        default:
          return "";
      }
    })
    .join("");
}

/**
 * Render marks (formatting) as closing HTML tags.
 */
function renderMarksClose(marks?: TiptapMark[]): string {
  if (!marks || marks.length === 0) return "";

  // Close in reverse order
  return marks
    .slice()
    .reverse()
    .map((mark) => {
      switch (mark.type) {
        case "bold":
          return "</strong>";
        case "italic":
          return "</em>";
        case "underline":
          return "</u>";
        case "strike":
          return "</s>";
        case "code":
          return "</code>";
        case "link": {
          const href = mark.attrs?.href;
          if (href && /^https?:\/\//i.test(href)) {
            return "</a>";
          }
          return "</span>";
        }
        default:
          return "";
      }
    })
    .join("");
}

/**
 * Render a single node to HTML.
 */
function renderNode(node: TiptapNode): string {
  // Text node
  if (node.type === "text") {
    const text = escapeHtml(node.text || "");
    return renderMarksOpen(node.marks) + text + renderMarksClose(node.marks);
  }

  // Get children HTML
  const children = node.content?.map(renderNode).join("") || "";

  switch (node.type) {
    case "paragraph":
      return `<p>${children}</p>`;

    case "heading": {
      const level = (node.attrs?.level as number) || 1;
      const safeLevel = Math.min(Math.max(level, 1), 6);
      return `<h${safeLevel}>${children}</h${safeLevel}>`;
    }

    case "bulletList":
      return `<ul>${children}</ul>`;

    case "orderedList": {
      const start = node.attrs?.start as number | undefined;
      if (start && start !== 1) {
        return `<ol start="${start}">${children}</ol>`;
      }
      return `<ol>${children}</ol>`;
    }

    case "listItem":
      return `<li>${children}</li>`;

    case "blockquote":
      return `<blockquote>${children}</blockquote>`;

    case "codeBlock": {
      const language = node.attrs?.language as string | undefined;
      if (language) {
        return `<pre><code class="language-${escapeHtml(language)}">${children}</code></pre>`;
      }
      return `<pre><code>${children}</code></pre>`;
    }

    case "hardBreak":
      return "<br>";

    case "horizontalRule":
      return "<hr>";

    default:
      // Unknown node type - render children only (safe fallback)
      return children;
  }
}

/**
 * Render a Tiptap document to HTML.
 * Pure JS implementation - works in Cloudflare Workers.
 */
export function renderToHtml(doc: TiptapDoc): string {
  return doc.content.map(renderNode).join("");
}

// =============================================================================
// DESCRIPTION SCHEMA (for job input validation)
// =============================================================================

/**
 * Schema for job description with content validation.
 * Checks both structure and extracted text length.
 */
export const JobDescriptionSchema = TiptapDocSchema.refine(
  (doc) => {
    const text = extractPlainText(doc as TiptapDoc);
    return text.length >= 50;
  },
  { message: "Description must be at least 50 characters" }
)
  .refine(
    (doc) => {
      const text = extractPlainText(doc as TiptapDoc);
      return text.length <= TIPTAP_LIMITS.maxTextLength;
    },
    { message: `Description must be at most ${TIPTAP_LIMITS.maxTextLength} characters` }
  )
  .refine((doc) => validateDepth(doc as TiptapDoc, TIPTAP_LIMITS.maxDepth), {
    message: `Description structure exceeds maximum nesting depth of ${TIPTAP_LIMITS.maxDepth}`,
  });
