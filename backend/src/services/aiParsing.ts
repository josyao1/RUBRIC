/**
 * AI Rubric Parsing — Extracts structured rubric criteria from documents
 *
 * Uses the Gemini API to parse rubric text or images into structured JSON
 * (criteria with performance levels). Exports parseRubricWithAI for text
 * input and parseRubricWithVision for image-based rubrics, along with
 * ParsedRubric, ParsedCriterion, and ParsedLevel interfaces.
 */
import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface ParsedLevel {
  label: string;      // e.g., "Excellent", "Good", "Developing", "Beginning"
  description: string;
}

export interface ParsedCriterion {
  name: string;
  description: string;
  levels: ParsedLevel[];
}

export interface ParsedRubric {
  criteria: ParsedCriterion[];
}

const RUBRIC_PARSING_PROMPT = `You are an expert at parsing educational rubrics for feedback purposes.
Analyze the following rubric and extract ALL criteria with their performance levels.
Focus on extracting descriptive feedback guidance, NOT point values.

For each criterion, extract:
- name: A short name for the criterion (e.g., "Thesis Statement", "Evidence", "Grammar")
- description: Brief description of what this criterion evaluates
- levels: An array of performance levels from HIGHEST to LOWEST, each with:
  - label: The level name (e.g., "Excellent", "Good", "Developing", "Beginning")
  - description: What performance at this level looks like - be detailed and actionable

Return ONLY valid JSON in this exact format:
{
  "criteria": [
    {
      "name": "Thesis Statement",
      "description": "Quality and clarity of the main argument",
      "levels": [
        {"label": "Excellent", "description": "Clear, specific, and arguable thesis that provides a roadmap for the essay"},
        {"label": "Good", "description": "Thesis is present and clear but could be more specific or arguable"},
        {"label": "Developing", "description": "Thesis is vague, too broad, or not clearly stated"},
        {"label": "Beginning", "description": "No clear thesis statement or main argument"}
      ]
    }
  ]
}

RUBRIC TEXT:
`;

const VISION_PARSING_PROMPT = `You are an expert at parsing educational rubric tables.

This is a rubric table. Parse it using this EXACT structure:
- ROWS = criteria (the things being graded, listed in the leftmost column)
- COLUMNS = performance levels (the score ranges or labels across the top row)

For each ROW (criterion), extract ONE criterion with ALL its column descriptions as levels.
Do NOT create a separate criterion for each cell — each ROW is ONE criterion.

For each criterion extract:
- name: The criterion name from the leftmost column
- description: A brief summary of what this criterion evaluates (infer from the descriptions if not stated)
- levels: One entry per column (left to right, highest to lowest), each with:
  - label: The column header (e.g., "16-20", "Excellent", "Proficient") — use the exact header text
  - description: The full cell text for that criterion at that level

Example: a rubric with 4 criteria and 4 level columns should produce exactly 4 criteria each with exactly 4 levels.

Return ONLY valid JSON:
{
  "criteria": [
    {
      "name": "Thesis Statement",
      "description": "Quality and clarity of the main argument",
      "levels": [
        {"label": "16-20", "description": "Clear, specific, and arguable thesis that provides a roadmap for the essay"},
        {"label": "11-15", "description": "Thesis is present and clear but could be more specific"},
        {"label": "6-10", "description": "Thesis is vague or too broad"},
        {"label": "0-5", "description": "No clear thesis statement"}
      ]
    }
  ]
}`;

export async function parseRubricWithAI(rawText: string): Promise<ParsedRubric> {
  console.log('[GEMINI] parseRubricWithAI called');

  if (!process.env.GEMINI_API_KEY) {
    console.log('[GEMINI] ERROR: No API key configured');
    throw new Error('GEMINI_API_KEY not configured. Add it to your .env file.');
  }
  console.log('[GEMINI] API key found (length: ' + process.env.GEMINI_API_KEY.length + ')');

  const prompt = RUBRIC_PARSING_PROMPT + rawText;
  console.log(`[GEMINI] Prompt length: ${prompt.length} characters`);
  console.log('[GEMINI] Sending request to gemini-2.5-flash-lite...');

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt
  });

  const text = response.text || '';
  console.log(`[GEMINI] Response received: ${text.length} characters`);
  console.log('[GEMINI] Raw response preview:', text.substring(0, 300));

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    console.log('[GEMINI] Extracted JSON from markdown code block');
    jsonText = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonText.trim());

    // Validate structure
    if (!parsed.criteria || !Array.isArray(parsed.criteria)) {
      console.log('[GEMINI] ERROR: Invalid response structure');
      throw new Error('Invalid response structure');
    }

    // Ensure all criteria have required fields
    const criteria = parsed.criteria.map((c: any, index: number) => ({
      name: c.name || `Criterion ${index + 1}`,
      description: c.description || '',
      levels: (c.levels || []).map((l: any, i: number) => ({
        label: l.label || `Level ${i + 1}`,
        description: l.description || ''
      }))
    }));

    console.log(`[GEMINI] Successfully parsed ${criteria.length} criteria`);
    criteria.forEach((c: ParsedCriterion) => console.log(`  - ${c.name}: ${c.levels.length} levels`));
    return { criteria };
  } catch (parseError) {
    console.error('[GEMINI] Failed to parse AI response:', text);
    throw new Error('Failed to parse AI response as JSON');
  }
}

// Parse rubric from an image file using Gemini Vision
export async function parseRubricWithVision(filePath: string): Promise<ParsedRubric> {
  console.log('[GEMINI VISION] parseRubricWithVision called');
  console.log(`[GEMINI VISION] File: ${filePath}`);

  if (!process.env.GEMINI_API_KEY) {
    console.log('[GEMINI VISION] ERROR: No API key configured');
    throw new Error('GEMINI_API_KEY not configured. Add it to your .env file.');
  }

  // Read the file and convert to base64
  const fileBuffer = readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  // Determine mime type from extension
  const ext = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'pdf': 'application/pdf'
  };
  const mimeType = mimeTypes[ext || ''] || 'image/png';
  console.log(`[GEMINI VISION] Mime type: ${mimeType}`);

  console.log('[GEMINI VISION] Sending image to gemini-2.5-flash-lite...');

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          },
          {
            text: VISION_PARSING_PROMPT
          }
        ]
      }
    ]
  });

  const text = response.text || '';
  console.log(`[GEMINI VISION] Response received: ${text.length} characters`);
  console.log('[GEMINI VISION] Raw response preview:', text.substring(0, 500));

  // Extract JSON from response
  let jsonText = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    console.log('[GEMINI VISION] Extracted JSON from markdown code block');
    jsonText = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonText.trim());

    if (!parsed.criteria || !Array.isArray(parsed.criteria)) {
      console.log('[GEMINI VISION] ERROR: Invalid response structure');
      throw new Error('Invalid response structure');
    }

    const criteria = parsed.criteria.map((c: any, index: number) => ({
      name: c.name || `Criterion ${index + 1}`,
      description: c.description || '',
      levels: (c.levels || []).map((l: any, i: number) => ({
        label: l.label || `Level ${i + 1}`,
        description: l.description || ''
      }))
    }));

    console.log(`[GEMINI VISION] Successfully parsed ${criteria.length} criteria`);
    criteria.forEach((c: ParsedCriterion) => console.log(`  - ${c.name}: ${c.levels.length} levels`));
    return { criteria };
  } catch (parseError) {
    console.error('[GEMINI VISION] Failed to parse AI response:', text);
    throw new Error('Failed to parse AI response as JSON');
  }
}
