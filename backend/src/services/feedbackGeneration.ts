import { GoogleGenAI } from '@google/genai';
import prisma from '../db/prisma.js';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Rate limiting and retry settings
const DELAY_BETWEEN_CALLS_MS = 4000;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 10000; // Start with 10s for retryable errors

// Helper to call Gemini API with retry logic for rate limits and overload errors
async function callGeminiWithRetry(prompt: string, retryCount = 0): Promise<string> {
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt
    });
    return response.text || '';
  } catch (error: any) {
    const status = error?.status;
    const isRateLimit = status === 429;
    const isOverloaded = status === 503;
    const isServerError = status >= 500 && status < 600;

    // Check if this is a daily quota error (free tier) - don't retry these
    if (isRateLimit) {
      const isDailyQuota = error?.message?.includes('free_tier') || error?.message?.includes('FreeTier');
      if (isDailyQuota) {
        console.error(`[FEEDBACK] Daily quota exceeded. Free tier allows only 20 requests/day (~10 submissions).`);
        console.error(`[FEEDBACK] Consider upgrading to a paid Gemini API plan for more capacity.`);
        throw new Error('Daily API quota exceeded. Free tier limit reached. Try again tomorrow or upgrade your Gemini API plan.');
      }
    }

    // Retry on rate limits (429), overloaded (503), and other server errors (5xx)
    if ((isRateLimit || isOverloaded || isServerError) && retryCount < MAX_RETRIES) {
      // Calculate delay with exponential backoff
      let retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);

      // Try to parse retry delay from error message if available
      const retryMatch = error?.message?.match(/retry in (\d+(?:\.\d+)?)/i);
      if (retryMatch) {
        retryDelay = Math.ceil(parseFloat(retryMatch[1]) * 1000) + 2000; // Add 2s buffer
      }

      // Cap max delay at 2 minutes
      retryDelay = Math.min(retryDelay, 120000);

      const errorType = isRateLimit ? 'Rate limited' : isOverloaded ? 'Model overloaded' : `Server error (${status})`;
      console.log(`[FEEDBACK] ${errorType}, waiting ${retryDelay/1000}s before retry ${retryCount + 1}/${MAX_RETRIES}`);

      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return callGeminiWithRetry(prompt, retryCount + 1);
    }

    // If we've exhausted retries or it's a non-retryable error, throw
    if (retryCount >= MAX_RETRIES) {
      console.error(`[FEEDBACK] Max retries (${MAX_RETRIES}) exceeded for error ${status}`);
    }
    throw error;
  }
}

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
  const criteriaDescription = criteria.map(c => {
    const levelsDesc = c.levels.map(l => `    - ${l.label}: ${l.description}`).join('\n');
    return `**${c.name}**${c.description ? `: ${c.description}` : ''}\n  Performance Levels:\n${levelsDesc}`;
  }).join('\n\n');

  return `You are an experienced educator providing rubric-based feedback. The rubric is your PRIMARY evaluation tool - every comment must connect to a specific rubric criterion and help the student understand how to meet that criterion's expectations.

${teacherPreferences ? `=== TEACHER'S SPECIFIC INSTRUCTIONS ===\n${teacherPreferences}\n\n` : ''}
=== THE RUBRIC (This is your primary evaluation tool) ===
${criteriaDescription}

=== YOUR TASK ===
Read the submission and identify 5-8 specific places where the work falls short of rubric expectations. Each comment must:
1. Target a specific phrase that demonstrates a gap in meeting a rubric criterion
2. Name which criterion it relates to
3. Explain what's missing or weak according to that criterion's standards
4. Tell the student specifically what to do to better meet that criterion

=== HOW TO EVALUATE USING THE RUBRIC ===
1. Go through EACH rubric criterion one by one
2. For each criterion, find places in the submission that relate to it
3. Use the performance level descriptions to understand what strong work looks like
4. Identify gaps between what the student did and what strong work requires
5. Your comment should explain what's missing and how to improve - WITHOUT naming or referencing performance levels

IMPORTANT:
- Do not give generic writing advice. Every comment must be grounded in what the rubric specifically asks for.
- If the rubric emphasizes "evidence," comment on evidence. If it emphasizes "analysis," comment on analysis.
- NEVER tell students what level they are at (e.g., "This is at Developing level"). Just tell them what to improve and how.
- Use the rubric levels internally to calibrate your feedback, but the student should only see actionable guidance.

=== STUDENT SUBMISSION ===
${submissionText}
=== END SUBMISSION ===

Return JSON:
{
  "inlineHighlights": [
    {
      "highlightedText": "exact phrase from submission (3-12 words)",
      "comment": "Rubric-based feedback: what criterion this relates to, what's expected, what's missing, how to fix it",
      "criterionName": "the exact rubric criterion name this relates to"
    }
  ]
}

=== COMMENT QUALITY STANDARDS ===
Every comment should follow this pattern:
"[What's wrong per the rubric] → [What the rubric expects] → [How to fix it]"

BAD (generic, not rubric-based):
"Unclear"
"Needs more detail"
"Awkward phrasing"

GOOD (rubric-grounded):
"This claim lacks the supporting evidence required by the Evidence criterion. Add a specific example or data point that demonstrates your claim."

"For the Analysis criterion, you state what happened but not why it matters. After this sentence, add 2-3 sentences explaining the significance."

"The Organization criterion requires clear transitions between ideas. This paragraph jumps topics - add a transition sentence connecting [previous idea] to [new idea]."

=== WHAT TO COMMENT ON ===
Focus ONLY on issues that relate to the rubric criteria provided. For each criterion, ask:
- Does the submission meet the highest performance level for this criterion?
- If not, where specifically does it fall short?
- What would the student need to add/change/remove to reach a higher level?

Do NOT comment on:
- Issues unrelated to the rubric criteria (unless teacher instructions specify otherwise)
- Things the student is already doing well (save praise for overall feedback)
- Minor issues that don't affect rubric performance
- Personal stylistic preferences not reflected in the rubric

=== HIGHLIGHT RULES ===
- Copy the EXACT text from the submission (3-12 words)
- Highlight the specific phrase that demonstrates the rubric gap
- Don't highlight random single words
- The highlighted text should clearly show the issue you're addressing

Return ONLY valid JSON, no markdown code blocks.`;
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
    return `**${c.name}**${c.description ? `: ${c.description}` : ''}\n  Performance Levels (from highest to lowest):\n${levelsDesc}`;
  }).join('\n\n');

  return `You are an experienced educator providing criterion-based feedback that helps students understand what to improve and how. Your feedback must be grounded in the rubric criteria - use the performance level descriptions to understand what strong work looks like, then guide students toward that standard.

${teacherPreferences ? `=== TEACHER'S SPECIFIC INSTRUCTIONS ===\n${teacherPreferences}\n\n` : ''}
=== RUBRIC CRITERIA AND PERFORMANCE LEVELS ===
${criteriaDescription}

=== HOW TO USE THE RUBRIC ===
For EACH criterion:
1. READ the student's work looking specifically for evidence related to that criterion
2. USE the performance level descriptions to understand what excellent work looks like
3. IDENTIFY the gaps between what the student did and what strong work requires
4. EXPLAIN what's missing or could be stronger, with specific examples from their work
5. PROVIDE concrete guidance on how to improve

IMPORTANT - DO NOT mention performance levels to the student:
- Use the levels internally to calibrate your feedback, but never say "you're at Developing level" or similar
- Instead of "this is Beginning level work," say "this section needs [specific improvement]"
- Focus on WHAT to improve and HOW, not on labeling or evaluating their current standing
- The goal is forward-looking guidance, not assessment

=== STUDENT SUBMISSION ===
${submissionText}
=== END SUBMISSION ===

Provide criterion-by-criterion feedback plus an overall assessment.

Return JSON:
{
  "sectionFeedback": [
    {
      "criterionName": "Exact Criterion Name from Rubric",
      "strengths": ["Only list genuine strengths you can point to in the text. If there are none for this criterion, use an empty array []. Never fabricate strengths."],
      "areasForGrowth": ["Be specific: 'The thesis in paragraph 1 states a topic but not an arguable claim' not 'thesis needs work'"],
      "suggestions": ["Actionable rewrites: 'Revise your thesis to: [Your topic] + [Your position] + [Because/reasons]' not just 'strengthen thesis'"]
    }
  ],
  "overall": {
    "summary": "2-3 sentences describing the main areas that need attention. Focus on what to work on, not on evaluating quality. Example: 'The main argument comes through but needs stronger evidence throughout. Focus revision on supporting each claim with specific examples.'",
    "priorityImprovements": ["The #1 change that would most improve this work", "The #2 most impactful change - be specific about what and how"],
    "encouragement": "One brief, genuine sentence. Acknowledge specific effort you can see, not generic praise. If you can't point to something specific, just acknowledge they submitted work and can improve with revision.",
    "nextSteps": ["First concrete action: 'Before your next draft, outline your argument with one claim per paragraph'", "Second action: 'For each claim, add at least one piece of specific evidence'"]
  }
}

=== FEEDBACK QUALITY STANDARDS ===

STRENGTHS - Only include if genuinely present:
BAD: "Shows effort" (meaningless)
BAD: "Good vocabulary" (generic filler)
GOOD: "The example in paragraph 3 about [specific thing] effectively illustrates the concept"
GOOD: "The counterargument in paragraph 4 shows awareness of opposing views"
BEST: If no genuine strengths exist for a criterion, return an empty array. This is honest and helpful.

AREAS FOR GROWTH - Be specific, describe what's missing:
BAD: "Organization needs improvement" (vague)
BAD: "Could use more evidence" (generic)
BAD: "This is at Developing level" (don't mention levels!)
GOOD: "Several paragraphs try to cover multiple ideas at once. Each paragraph should develop one clear point."
GOOD: "The claim that 'technology is bad for society' in paragraph 2 has no supporting evidence. Add a specific example or data."

SUGGESTIONS - Must be actionable, not vague:
BAD: "Work on your thesis"
BAD: "Add more analysis"
GOOD: "Rewrite your thesis using this formula: [Topic] + [Your specific position] + [2-3 reasons why]. Current thesis: 'This essay is about climate change.' Revised: 'Climate change requires immediate government action because [reason 1], [reason 2], and [reason 3].'"
GOOD: "After each piece of evidence, add 2-3 sentences explaining: (1) what this evidence shows, (2) why it matters to your argument, (3) how it connects to your thesis."

OVERALL SUMMARY - Forward-looking, not evaluative:
BAD: "Good effort on this essay!" (empty)
BAD: "This is at the Developing level overall." (don't mention levels!)
BAD: "This essay has some strengths and some areas for improvement." (says nothing)
GOOD: "The main argument is present but underdeveloped - most claims need supporting evidence. Focus your revision on adding specific examples and explaining how each one supports your thesis."

ENCOURAGEMENT - Genuine, not empty:
BAD: "Great job!" / "Keep up the good work!" / "You're on the right track!"
GOOD: "You've taken on a complex topic and made a clear attempt to structure an argument - that's the foundation to build on."
GOOD: "This revision shows you addressed the feedback on thesis clarity from your last draft."
ACCEPTABLE: "With focused revision on the priority areas above, you can significantly strengthen this work."

=== CRITICAL RULES ===
1. Every piece of feedback must connect to what the rubric criteria ask for
2. NEVER mention performance levels (Excellent, Proficient, Developing, Beginning, etc.) - just describe what to improve
3. Never fabricate strengths - empty arrays are better than fake praise
4. Be direct about what needs work - students need to know what to fix
5. Make suggestions specific enough that students know exactly what to do
6. The goal is to guide improvement, not to evaluate or grade

Return ONLY valid JSON, no markdown code blocks.`;
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

  const text = await callGeminiWithRetry(prompt);
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
    let tooLongCount = 0;
    const MAX_HIGHLIGHT_LENGTH = 150; // Max characters for a highlight
    const MAX_HIGHLIGHT_PERCENT = 0.15; // Max 15% of document

    for (const highlight of parsed.inlineHighlights) {
      if (!highlight.highlightedText) continue;

      const position = findTextPosition(submissionText, highlight.highlightedText);
      if (!position) {
        notFoundCount++;
        console.log(`[FEEDBACK] Text not found: "${highlight.highlightedText?.substring(0, 40)}..."`);
        continue;
      }

      // Check if highlight is too long
      const highlightLength = position.end - position.start;
      const docLength = submissionText.length;
      if (highlightLength > MAX_HIGHLIGHT_LENGTH || highlightLength > docLength * MAX_HIGHLIGHT_PERCENT) {
        tooLongCount++;
        console.log(`[FEEDBACK] Highlight too long (${highlightLength} chars, ${Math.round(highlightLength/docLength*100)}% of doc), skipping`);
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
    console.log(`[FEEDBACK] Saved ${savedCount} inline comments (${notFoundCount} not found, ${tooLongCount} too long)`);
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

  const text = await callGeminiWithRetry(prompt);
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
  teacherPreferences?: string,
  submissionIds?: string[]
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

  // Filter to specific submissions if IDs provided
  const targetSubmissions = submissionIds
    ? assignment.submissions.filter(s => submissionIds.includes(s.id))
    : assignment.submissions;

  if (targetSubmissions.length === 0) {
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
      gradingTotal: targetSubmissions.length,
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
  for (const submission of targetSubmissions) {
    try {
      await prisma.submission.update({
        where: { id: submission.id },
        data: { status: 'processing' }
      });

      // Clear existing feedback and reset release status (so teacher must re-release)
      await prisma.inlineComment.deleteMany({ where: { submissionId: submission.id } });
      await prisma.sectionFeedback.deleteMany({ where: { submissionId: submission.id } });
      await prisma.overallFeedback.deleteMany({ where: { submissionId: submission.id } });

      // Reset release status - teacher must explicitly re-release after regrade
      // Keep the token so the same magic link works after re-release
      await prisma.submission.update({
        where: { id: submission.id },
        data: { feedbackReleased: false, feedbackViewedAt: null }
      });

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

      console.log(`[FEEDBACK] Progress: ${processed}/${targetSubmissions.length}`);

      // Pause before next submission
      if (processed < targetSubmissions.length) {
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
