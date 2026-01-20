/**
 * CV Summarizer
 * =============
 * LLM-based CV summarization into structured data.
 *
 * Extracts:
 * - Work experiences (title, company, dates, duration)
 * - Education (degree, field, institution)
 * - Skills (categorized)
 * - Summary fields (total experience, management experience)
 */

import type { LLMClient } from "../jobs/archetypes/inference";

// =============================================================================
// TYPES
// =============================================================================

export interface CVWorkExperience {
  title: string;
  company: string;
  startDate: string | null; // YYYY-MM or YYYY
  endDate: string | null; // YYYY-MM, YYYY, or "present"
  isCurrent: boolean;
  durationMonths: number | null;
  highlights: string[];
}

export interface CVEducation {
  degree: string | null; // "Bachelor's", "Master's", "PhD", etc.
  field: string | null; // "Computer Science", etc.
  institution: string;
  year: string | null; // Graduation year
}

export interface CVSkill {
  name: string;
  category: "language" | "framework" | "tool" | "soft_skill" | "other";
}

export interface CVSummary {
  workExperiences: CVWorkExperience[];
  education: CVEducation[];
  skills: CVSkill[];
  totalYearsExperience: number | null;
  hasManagementExperience: boolean;
  gaps: string[]; // Career gaps detected
  rawSummary: string; // Brief text summary
}

export interface SummarizationResult {
  success: boolean;
  summary: CVSummary | null;
  error?: string;
}

// =============================================================================
// LLM PROMPT
// =============================================================================

const CV_SUMMARIZATION_PROMPT = `You are a CV/resume parser. Extract structured information from the provided CV text.

Return a JSON object with the following structure:
{
  "workExperiences": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "startDate": "YYYY-MM" or "YYYY" or null,
      "endDate": "YYYY-MM" or "YYYY" or "present" or null,
      "isCurrent": true/false,
      "durationMonths": number or null,
      "highlights": ["key achievement 1", "key achievement 2"]
    }
  ],
  "education": [
    {
      "degree": "Bachelor's" or "Master's" or "PhD" or "High School" or null,
      "field": "Field of Study" or null,
      "institution": "University/School Name",
      "year": "YYYY" or null
    }
  ],
  "skills": [
    {
      "name": "Skill Name",
      "category": "language" | "framework" | "tool" | "soft_skill" | "other"
    }
  ],
  "totalYearsExperience": number or null,
  "hasManagementExperience": true/false,
  "gaps": ["Description of gap if any"],
  "rawSummary": "1-2 sentence summary of the candidate's background"
}

Guidelines:
1. Order work experiences from most recent to oldest
2. Order education from highest degree to lowest
3. For skills, categorize as:
   - "language": Programming languages (Python, JavaScript, etc.)
   - "framework": Frameworks/libraries (React, Django, etc.)
   - "tool": Tools/platforms (Docker, AWS, etc.)
   - "soft_skill": Soft skills (Leadership, Communication, etc.)
   - "other": Other technical skills
4. Calculate totalYearsExperience as sum of work experience durations
5. Set hasManagementExperience to true if any job title contains: Manager, Lead, Director, VP, Chief, Head of
6. Identify career gaps of 6+ months between jobs
7. If dates are ambiguous, make reasonable assumptions
8. Extract up to 3 key highlights per job (achievements, not responsibilities)
9. Limit to 20 most relevant skills

Return ONLY valid JSON. No explanation or markdown.`;

// =============================================================================
// PARSING HELPERS
// =============================================================================

/**
 * Parse and validate the LLM response.
 */
function parseLLMResponse(response: string): CVSummary | null {
  try {
    // Try to extract JSON from response (in case LLM added extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[CV Summarizer] No JSON found in response");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!Array.isArray(parsed.workExperiences)) {
      parsed.workExperiences = [];
    }
    if (!Array.isArray(parsed.education)) {
      parsed.education = [];
    }
    if (!Array.isArray(parsed.skills)) {
      parsed.skills = [];
    }
    if (!Array.isArray(parsed.gaps)) {
      parsed.gaps = [];
    }

    // Sanitize work experiences
    const workExperiences: CVWorkExperience[] = parsed.workExperiences
      .slice(0, 20) // Limit to 20 entries
      .map((exp: Record<string, unknown>) => ({
        title: String(exp.title ?? "Unknown"),
        company: String(exp.company ?? "Unknown"),
        startDate: exp.startDate ? String(exp.startDate) : null,
        endDate: exp.endDate ? String(exp.endDate) : null,
        isCurrent: Boolean(exp.isCurrent),
        durationMonths: typeof exp.durationMonths === "number" ? exp.durationMonths : null,
        highlights: Array.isArray(exp.highlights)
          ? exp.highlights.slice(0, 5).map(String)
          : [],
      }));

    // Sanitize education
    const education: CVEducation[] = parsed.education
      .slice(0, 10) // Limit to 10 entries
      .map((edu: Record<string, unknown>) => ({
        degree: edu.degree ? String(edu.degree) : null,
        field: edu.field ? String(edu.field) : null,
        institution: String(edu.institution ?? "Unknown"),
        year: edu.year ? String(edu.year) : null,
      }));

    // Sanitize skills
    const validCategories = ["language", "framework", "tool", "soft_skill", "other"] as const;
    const skills: CVSkill[] = parsed.skills
      .slice(0, 30) // Limit to 30 skills
      .map((skill: Record<string, unknown>) => ({
        name: String(skill.name ?? ""),
        category: validCategories.includes(skill.category as typeof validCategories[number])
          ? (skill.category as CVSkill["category"])
          : "other",
      }))
      .filter((s: CVSkill) => s.name.length > 0);

    return {
      workExperiences,
      education,
      skills,
      totalYearsExperience:
        typeof parsed.totalYearsExperience === "number" ? parsed.totalYearsExperience : null,
      hasManagementExperience: Boolean(parsed.hasManagementExperience),
      gaps: parsed.gaps.slice(0, 5).map(String),
      rawSummary: String(parsed.rawSummary ?? ""),
    };
  } catch (error) {
    console.error("[CV Summarizer] Failed to parse LLM response:", error);
    return null;
  }
}

// =============================================================================
// MAIN SUMMARIZATION FUNCTION
// =============================================================================

/**
 * Summarize CV text into structured data using LLM.
 *
 * @param client - LLM client for API calls
 * @param cvText - Extracted text from CV
 * @returns Summarization result with structured data or error
 */
export async function summarizeCV(
  client: LLMClient,
  cvText: string
): Promise<SummarizationResult> {
  // Truncate CV text if too long (keep first ~15k chars)
  const maxLength = 15000;
  const truncatedText =
    cvText.length > maxLength
      ? cvText.slice(0, maxLength) + "\n\n[CV text truncated for processing]"
      : cvText;

  try {
    const response = await client.complete({
      system: CV_SUMMARIZATION_PROMPT,
      user: `Parse this CV:\n\n${truncatedText}`,
      temperature: 0.1, // Low temperature for consistent parsing
    });

    const summary = parseLLMResponse(response);

    if (!summary) {
      return {
        success: false,
        summary: null,
        error: "Failed to parse CV summary from LLM response",
      };
    }

    return {
      success: true,
      summary,
    };
  } catch (error) {
    return {
      success: false,
      summary: null,
      error: `CV summarization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
