import { GoogleGenAI } from '@google/genai';
import prisma from '../db/prisma.js';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Rate limiting: Gemini 2.5 Flash Lite = 30 RPM
// 2 requests per submission, ~8 seconds between calls to stay safe
const DELAY_BETWEEN_CALLS_MS = 4000;

interface RubricCriterion {
  id: string;
  name: string;
  description: string | null;
  levels: {
    label: string;
    description: string;
  }[];
}

// Normalize text for matching: collapse whitespace, trim
function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Find text position with fuzzy matching
function findTextPosition(submissionText: string, highlightText: string): { start: number; end: number } | null {
  // Try exact match first
  let pos = submissionText.indexOf(highlightText);
  if (pos !== -1) {
    return { start: pos, end: pos + highlightText.length };
  }

  // Try normalized match (collapse whitespace)
  const normalizedSubmission = normalizeText(submissionText);
  const normalizedHighlight = normalizeText(highlightText);

  pos = normalizedSubmission.indexOf(normalizedHighlight);
  if (pos !== -1) {
    // Map back to original position (approximate)
    // Find the nth word in original text
    const words = normalizedHighlight.split(' ');
    const firstWord = words[0];
    const lastWord = words[words.length - 1];

    // Find first word in original
    const firstWordPos = submissionText.indexOf(firstWord);
    if (firstWordPos !== -1) {
      // Find last word after first word
      const searchAfter = submissionText.indexOf(lastWord, firstWordPos);
      if (searchAfter !== -1) {
        return { start: firstWordPos, end: searchAfter + lastWord.length };
      }
    }
  }

  // Try matching just the first 30 chars (in case LLM truncated or modified ending)
  if (highlightText.length > 30) {
    const shortHighlight = highlightText.substring(0, 30);
    pos = submissionText.indexOf(shortHighlight);
    if (pos !== -1) {
      // Find a reasonable end point (next sentence or 100 chars)
      const endSearch = submissionText.substring(pos, pos + 150);
      const sentenceEnd = endSearch.search(/[.!?]/);
      const endPos = sentenceEnd !== -1 ? pos + sentenceEnd + 1 : pos + highlightText.length;
      return { start: pos, end: Math.min(endPos, submissionText.length) };
    }
  }

  // Try matching a key phrase from the middle (5+ words)
  const words = highlightText.split(/\s+/);
  if (words.length >= 5) {
    const middleStart = Math.floor(words.length / 3);
    const keyPhrase = words.slice(middleStart, middleStart + 4).join(' ');
    pos = submissionText.indexOf(keyPhrase);
    if (pos !== -1) {
      // Expand to find full context
      const start = Math.max(0, submissionText.lastIndexOf(' ', pos - 1) + 1);
      const afterPhrase = pos + keyPhrase.length;
      const nextPeriod = submissionText.indexOf('.', afterPhrase);
      const end = nextPeriod !== -1 ? nextPeriod + 1 : afterPhrase + 50;
      return { start, end: Math.min(end, submissionText.length) };
    }
  }

  return null;
}

// =============================================================================
// PROMPT 1: INLINE COMMENTS (Revision Guidance)
// =============================================================================
function buildInlineCommentsPrompt(
  submissionText: string,
  criteria: RubricCriterion[],
  teacherPreferences?: string
): string {
  const criteriaNames = criteria.map(c => c.name).join(', ');

  return `You are an experienced writing teacher giving focused, meaningful feedback.
Only comment where it truly matters - quality over quantity.

${teacherPreferences ? `TEACHER'S INSTRUCTIONS: ${teacherPreferences}\n\n` : ''}
RUBRIC CRITERIA: ${criteriaNames}

STUDENT SUBMISSION:
---
${submissionText}
---

Add 5-8 inline comments on the most important issues. Each comment should be worth the student's attention.

Return JSON:
{
  "inlineHighlights": [
    {
      "highlightedText": "the specific phrase with the issue (3-10 words)",
      "comment": "brief, clear guidance",
      "criterionName": "relevant criterion"
    }
  ]
}

WHAT DESERVES A COMMENT:
- Claims without evidence or support
- Unclear or confusing sentences that need rewriting
- Logical gaps or missing transitions between ideas
- Weak thesis or topic sentences
- Grammar/mechanics errors that affect meaning
- Places where more depth or analysis is needed

WHAT DOES NOT DESERVE A COMMENT:
- Random words that are fine in context
- Minor stylistic preferences
- Things that are already clear
- Asking to "elaborate" on something self-explanatory

COMMENT STYLE:
- Be specific: "Add evidence" not just "?"
- Be clear: "Unclear - what causes this?" not "Confusing"
- Be helpful: "Connect this to your thesis" not just "Transition"

HIGHLIGHT RULES:
- Highlight the specific phrase with the problem (3-10 words)
- Copy text EXACTLY as written
- Don't highlight random single words

Return ONLY valid JSON.`;
}

// =============================================================================
// PROMPT 2: SYNTHESIZED FEEDBACK (Section + Overall)
// =============================================================================
function buildSynthesizedFeedbackPrompt(
  submissionText: string,
  criteria: RubricCriterion[],
  teacherPreferences?: string
): string {
  const criteriaDescription = criteria.map(c => {
    const levelsDesc = c.levels.map(l => `    - ${l.label}: ${l.description}`).join('\n');
    return `- ${c.name}: ${c.description || ''}\n${levelsDesc}`;
  }).join('\n\n');

  return `You are an experienced educator writing substantive feedback on student work.
Goal: Help the student understand what to IMPROVE for their next draft.

${teacherPreferences ? `TEACHER'S INSTRUCTIONS: ${teacherPreferences}\n\n` : ''}
RUBRIC CRITERIA:
${criteriaDescription}

STUDENT SUBMISSION:
---
${submissionText}
---

Provide detailed feedback in JSON:
{
  "sectionFeedback": [
    {
      "criterionName": "Criterion Name",
      "strengths": ["specific strength if genuinely present"],
      "areasForGrowth": ["what needs improvement - be specific"],
      "suggestions": ["concrete action: 'Try restructuring paragraph 2 to...'"]
    }
  ],
  "overall": {
    "summary": "2-3 sentences: honest assessment of where this work stands",
    "priorityImprovements": ["most impactful change #1", "most impactful change #2"],
    "encouragement": "brief acknowledgment of effort/progress (1 sentence, no fluff)",
    "nextSteps": ["specific action for revision #1", "specific action #2"]
  }
}

GUIDELINES:
- Be HONEST. If a criterion is weak, say so. Don't force strengths.
- Be SPECIFIC. Not "improve organization" but "move the counterargument to paragraph 3"
- Be ACTIONABLE. Every suggestion should tell them WHAT TO DO
- Be RESPECTFUL but DIRECT. Critique the work, not the student.
- Focus on the 2-3 changes that would have the BIGGEST impact
- "encouragement" should acknowledge genuine effort, not empty praise

Return ONLY valid JSON.`;
}

// =============================================================================
// GENERATION FUNCTIONS
// =============================================================================
async function generateInlineComments(
  submissionId: string,
  submissionText: string,
  criteria: RubricCriterion[],
  teacherPreferences?: string
): Promise<void> {
  console.log(`[FEEDBACK] Generating inline comments for ${submissionId}`);

  const prompt = buildInlineCommentsPrompt(submissionText, criteria, teacherPreferences);

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt
  });

  const text = response.text || '';
  let jsonText = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonText = jsonMatch[1];

  let parsed;
  try {
    parsed = JSON.parse(jsonText.trim());
  } catch (e) {
    console.error('[FEEDBACK] Failed to parse inline response:', text);
    throw new Error('Failed to parse inline comments response');
  }

  const criterionMap = new Map<string, string>();
  criteria.forEach(c => criterionMap.set(c.name.toLowerCase(), c.id));

  if (parsed.inlineHighlights && Array.isArray(parsed.inlineHighlights)) {
    let savedCount = 0;
    let notFoundCount = 0;
    for (const highlight of parsed.inlineHighlights) {
      if (!highlight.highlightedText) continue;

      const position = findTextPosition(submissionText, highlight.highlightedText);
      if (!position) {
        notFoundCount++;
        console.log(`[FEEDBACK] Text not found: "${highlight.highlightedText?.substring(0, 40)}..."`);
        continue;
      }

      // Get the actual text from the submission at this position
      const actualText = submissionText.substring(position.start, position.end);

      await prisma.inlineComment.create({
        data: {
          submissionId,
          startPosition: position.start,
          endPosition: position.end,
          highlightedText: actualText, // Use actual text from submission
          comment: highlight.comment,
          criterionId: criterionMap.get(highlight.criterionName?.toLowerCase() || '') || null
        }
      });
      savedCount++;
    }
    console.log(`[FEEDBACK] Saved ${savedCount} inline comments (${notFoundCount} not found)`);
  }
}

async function generateSynthesizedFeedback(
  submissionId: string,
  submissionText: string,
  criteria: RubricCriterion[],
  teacherPreferences?: string
): Promise<void> {
  console.log(`[FEEDBACK] Generating synthesized feedback for ${submissionId}`);

  const prompt = buildSynthesizedFeedbackPrompt(submissionText, criteria, teacherPreferences);

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt
  });

  const text = response.text || '';
  let jsonText = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonText = jsonMatch[1];

  let parsed;
  try {
    parsed = JSON.parse(jsonText.trim());
  } catch (e) {
    console.error('[FEEDBACK] Failed to parse synthesized response:', text);
    throw new Error('Failed to parse synthesized feedback response');
  }

  const criterionMap = new Map<string, string>();
  criteria.forEach(c => criterionMap.set(c.name.toLowerCase(), c.id));

  // Save section feedback
  if (parsed.sectionFeedback && Array.isArray(parsed.sectionFeedback)) {
    for (const section of parsed.sectionFeedback) {
      const criterionId = criterionMap.get(section.criterionName?.toLowerCase() || '');
      if (!criterionId) {
        console.log(`[FEEDBACK] Criterion not found: "${section.criterionName}"`);
        continue;
      }

      await prisma.sectionFeedback.create({
        data: {
          submissionId,
          criterionId,
          strengths: JSON.stringify(section.strengths || []),
          areasForGrowth: JSON.stringify(section.areasForGrowth || []),
          suggestions: JSON.stringify(section.suggestions || [])
        }
      });
    }
    console.log(`[FEEDBACK] Saved section feedback for ${parsed.sectionFeedback.length} criteria`);
  }

  // Save overall feedback
  if (parsed.overall) {
    await prisma.overallFeedback.create({
      data: {
        submissionId,
        summary: parsed.overall.summary || '',
        priorityImprovements: JSON.stringify(parsed.overall.priorityImprovements || []),
        encouragement: parsed.overall.encouragement || '',
        nextSteps: JSON.stringify(parsed.overall.nextSteps || [])
      }
    });
    console.log(`[FEEDBACK] Saved overall feedback`);
  }
}

// =============================================================================
// MAIN PROCESSING FUNCTION
// =============================================================================
export async function processAssignmentFeedback(
  assignmentId: string,
  teacherPreferences?: string
): Promise<void> {
  console.log(`[FEEDBACK] Starting feedback generation for assignment ${assignmentId}`);

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      rubric: {
        include: {
          criteria: {
            include: { levels: true },
            orderBy: { sortOrder: 'asc' }
          }
        }
      },
      submissions: true
    }
  });

  if (!assignment) throw new Error('Assignment not found');
  if (!assignment.rubric) throw new Error('Assignment has no rubric linked');

  if (assignment.submissions.length === 0) {
    console.log('[FEEDBACK] No submissions to process');
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { gradingStatus: 'completed', gradingProgress: 0, gradingTotal: 0 }
    });
    return;
  }

  await prisma.assignment.update({
    where: { id: assignmentId },
    data: {
      gradingStatus: 'in_progress',
      gradingProgress: 0,
      gradingTotal: assignment.submissions.length,
      teacherPreferences: teacherPreferences || null
    }
  });

  const criteria: RubricCriterion[] = assignment.rubric.criteria.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    levels: c.levels.map(l => ({ label: l.label, description: l.description }))
  }));

  let processed = 0;
  for (const submission of assignment.submissions) {
    try {
      await prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'processing' }
      });

      // Clear existing feedback
      await prisma.inlineComment.deleteMany({ where: { submissionId: submission.id } });
      await prisma.sectionFeedback.deleteMany({ where: { submissionId: submission.id } });
      await prisma.overallFeedback.deleteMany({ where: { submissionId: submission.id } });

      if (submission.extractedText) {
        // Call 1: Inline comments
        await generateInlineComments(submission.id, submission.extractedText, criteria, teacherPreferences);

        // Rate limit pause
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));

        // Call 2: Synthesized feedback
        await generateSynthesizedFeedback(submission.id, submission.extractedText, criteria, teacherPreferences);
      } else {
        console.log(`[FEEDBACK] No text for submission ${submission.id}, skipping`);
      }

      await prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'ready' }
      });

      processed++;
      await prisma.assignment.update({
        where: { id: assignmentId },
        data: { gradingProgress: processed }
      });

      console.log(`[FEEDBACK] Progress: ${processed}/${assignment.submissions.length}`);

      // Pause before next submission
      if (processed < assignment.submissions.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));
      }
    } catch (error) {
      console.error(`[FEEDBACK] Error processing submission ${submission.id}:`, error);
      await prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'pending' }
      });
    }
  }

  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { gradingStatus: 'completed' }
  });

  console.log(`[FEEDBACK] Completed feedback generation for assignment ${assignmentId}`);
}
