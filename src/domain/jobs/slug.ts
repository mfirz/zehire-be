/**
 * Slug Utility
 * ============
 * Generates SEO-friendly URL slugs for public job pages.
 *
 * Slug format: {company-name}-{job-title}-{unique-suffix}
 * Example: "acme-corp-senior-engineer-x7k3m"
 */

import { nanoid } from "nanoid";
import type { JobRepository } from "./repository";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Length of random suffix for uniqueness */
const SUFFIX_LENGTH = 5;

/** Maximum length of the base slug (before suffix) */
const MAX_BASE_LENGTH = 80;

/** Maximum attempts to find a unique slug */
const MAX_UNIQUENESS_ATTEMPTS = 10;

// =============================================================================
// SLUG GENERATION
// =============================================================================

/**
 * Generate a URL-safe slug from text components.
 *
 * @param companyName - Company name (optional)
 * @param title - Job title (required)
 * @returns Base slug without uniqueness suffix
 */
export function generateBaseSlug(companyName: string | null, title: string): string {
  const parts: string[] = [];

  if (companyName && companyName.trim()) {
    parts.push(companyName.trim());
  }

  parts.push(title.trim());

  // Join and slugify
  const combined = parts.join(" ");

  let slug = combined
    // Convert to lowercase
    .toLowerCase()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, "-")
    // Remove all non-alphanumeric characters except hyphens
    .replace(/[^a-z0-9-]/g, "")
    // Collapse multiple hyphens
    .replace(/-+/g, "-")
    // Trim hyphens from start and end
    .replace(/^-+|-+$/g, "");

  // Truncate if too long
  if (slug.length > MAX_BASE_LENGTH) {
    slug = slug.substring(0, MAX_BASE_LENGTH);
    // Remove trailing hyphen if truncation created one
    slug = slug.replace(/-+$/, "");
  }

  return slug;
}

/**
 * Generate a unique slug for a job.
 *
 * Adds a random suffix to ensure uniqueness and checks against
 * existing slugs in the database.
 *
 * @param repository - Job repository for uniqueness check
 * @param companyName - Company name (optional)
 * @param title - Job title (required)
 * @returns Unique slug guaranteed not to exist in DB
 */
export async function generateUniqueSlug(
  repository: JobRepository,
  companyName: string | null,
  title: string
): Promise<string> {
  const baseSlug = generateBaseSlug(companyName, title);

  for (let attempt = 0; attempt < MAX_UNIQUENESS_ATTEMPTS; attempt++) {
    // Generate suffix
    const suffix = nanoid(SUFFIX_LENGTH).toLowerCase();
    const candidateSlug = baseSlug ? `${baseSlug}-${suffix}` : suffix;

    // Check if slug exists
    const exists = await repository.slugExists(candidateSlug);

    if (!exists) {
      return candidateSlug;
    }
  }

  // Fallback: use longer suffix if many attempts fail
  // This should be extremely rare in practice
  const fallbackSuffix = nanoid(10).toLowerCase();
  return baseSlug ? `${baseSlug}-${fallbackSuffix}` : fallbackSuffix;
}
