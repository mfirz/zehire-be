/**
 * Tiptap Document Types
 * =====================
 * TypeScript types for Tiptap's ProseMirror-based document structure.
 */

// =============================================================================
// CONSTANTS
// =============================================================================

export const TIPTAP_LIMITS = {
  maxTextLength: 30_000,
  maxJsonSize: 150_000,
  maxDepth: 10,
  maxChildrenPerNode: 500,
  maxTextPerNode: 10_000,
} as const;

export const ALLOWED_NODES = [
  "doc",
  "paragraph",
  "text",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
] as const;

export const ALLOWED_MARKS = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
] as const;

// =============================================================================
// TYPES
// =============================================================================

export type AllowedNodeType = (typeof ALLOWED_NODES)[number];
export type AllowedMarkType = (typeof ALLOWED_MARKS)[number];

/**
 * Tiptap mark (formatting applied to text).
 */
export interface TiptapMark {
  type: AllowedMarkType;
  attrs?: {
    href?: string;
    target?: string;
    [key: string]: unknown;
  };
}

/**
 * Tiptap node (element in the document tree).
 */
export interface TiptapNode {
  type: AllowedNodeType;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
  attrs?: Record<string, unknown>;
}

/**
 * Tiptap document (root node).
 */
export interface TiptapDoc {
  type: "doc";
  content: TiptapNode[];
}
