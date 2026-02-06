import { GoogleGenAI } from '@google/genai';
import prisma from '../db/prisma.js';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Rate limiting settings
const DELAY_BETWEEN_CALLS_MS = 4000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 25000; // Start with 25s for rate limit errors

// Helper to call Gemini API with retry logic for rate limits
async function callGeminiWithRetry(prompt: string, retryCount = 0): Promise<string> {
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt
    });
    return response.text || '';
  } catch (error: any) {
    // Check if it's a rate limit error (429)
    if (error?.status === 429) {
      // Check if this is a daily quota error (free tier)
      const isDailyQuota = error?.message?.includes('free_tier') || error?.message?.includes('FreeTier');

      if (isDailyQuota) {
        console.error(`[FEEDBACK] Daily quota exceeded. Free tier allows only 20 requests/day (~10 submissions).`);
        console.error(`[FEEDBACK] Consider upgrading to a paid Gemini API plan for more capacity.`);
        throw new Error('Daily API quota exceeded. Free tier limit reached. Try again tomorrow or upgrade your Gemini API plan.');
      }

      if (retryCount < MAX_RETRIES) {
        // Extract retry delay from error if available, otherwise use exponential backoff
        let retryDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);

        // Try to parse retry delay from error message
        const retryMatch = error?.message?.match(/retry in (\d+(?:\.\d+)?)/i);
        if (retryMatch) {
          retryDelay = Math.ceil(parseFloat(retryMatch[1]) * 1000) + 2000; // Add 2s buffer
        }

        console.log(`[FEEDBACK] Rate limited, waiting ${retryDelay/1000}s before retry ${retryCount + 1}/${MAX_RETRIES}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return callGeminiWithRetry(prompt, retryCount + 1);
      }
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
3. Compare what you see against the performance level descriptions
4. If the work is below the top level, identify the specific gap
5. Your comment should explain: "For [criterion], you need [X] but here you have [Y]. To improve, do [Z]."

IMPORTANT: Do not give generic writing advice. Every comment must be grounded in what the rubric specifically asks for. If the rubric emphasizes "evidence," comment on evidence. If it emphasizes "analysis," comment on analysis. Let the rubric guide what you focus on.

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

  return `You are an experienced educator providing criterion-based feedback that helps students understand exactly where their work stands and what to do next. Your feedback must be grounded in the rubric - every assessment should connect to specific performance levels.

${teacherPreferences ? `=== TEACHER'S SPECIFIC INSTRUCTIONS ===\n${teacherPreferences}\n\n` : ''}
=== RUBRIC CRITERIA AND PERFORMANCE LEVELS ===
${criteriaDescription}

=== HOW TO APPLY THE RUBRIC ===
For EACH criterion, you must:
1. READ the student's work looking specifically for evidence related to that criterion
2. COMPARE what you see against the performance level descriptions
3. DETERMINE which level best describes the student's current performance
4. EXPLAIN your assessment by pointing to specific evidence (or lack thereof) in their work
5. PROVIDE concrete guidance on what would move them to the next level

Be honest about performance levels:
- If work is at "Beginning" or "Developing" level, say so clearly
- Don't inflate assessments to make students feel better
- Students can't improve if they don't know where they actually stand
- It's not mean to be honest - it's respectful of their ability to grow

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
    "summary": "2-3 sentences giving an honest assessment. Name the current performance level if clear. Example: 'This draft shows developing skills in analysis but needs significant work on evidence and organization to reach proficient level.'",
    "priorityImprovements": ["The #1 change that would most improve this work", "The #2 most impactful change - be specific about what and how"],
    "encouragement": "One brief, genuine sentence. Acknowledge specific effort you can see, not generic praise. If you can't point to something specific, just acknowledge they submitted work and can improve with revision.",
    "nextSteps": ["First concrete action: 'Before your next draft, outline your argument with one claim per paragraph'", "Second action: 'For each claim, add at least one piece of specific evidence'"]
  }
}

=== FEEDBACK QUALITY STANDARDS ===

STRENGTHS - Only include if genuinely present:
BAD: "Shows effort" (meaningless)
BAD: "Good vocabulary" (generic filler)
GOOD: "The example in paragraph 3 about [specific thing] effectively illustrates the concept of [X]"
GOOD: "The counterargument in paragraph 4 shows awareness of opposing views"
BEST: If no genuine strengths exist for a criterion, return an empty array. This is honest and helpful.

AREAS FOR GROWTH - Be specific and rubric-connected:
BAD: "Organization needs improvement"
BAD: "Could use more evidence"
GOOD: "Currently at 'Developing' level for organization: paragraphs contain multiple unrelated ideas. 'Proficient' requires each paragraph to develop one clear point."
GOOD: "The claim that 'technology is bad for society' in paragraph 2 has no supporting evidence - this is a 'Beginning' level issue per the rubric."

SUGGESTIONS - Must be actionable, not vague:
BAD: "Work on your thesis"
BAD: "Add more analysis"
GOOD: "Rewrite your thesis using this formula: [Topic] + [Your specific position] + [2-3 reasons why]. Current thesis: 'This essay is about climate change.' Revised: 'Climate change requires immediate government action because [reason 1], [reason 2], and [reason 3].'"
GOOD: "After each piece of evidence, add 2-3 sentences explaining: (1) what this evidence shows, (2) why it matters to your argument, (3) how it connects to your thesis."

OVERALL SUMMARY - Honest assessment:
BAD: "Good effort on this essay!"
BAD: "This essay has some strengths and some areas for improvement."
GOOD: "This draft is at the 'Developing' level overall. The main argument is present but underdeveloped, with most claims lacking evidence. With focused revision on evidence and paragraph organization, this could reach 'Proficient.'"

ENCOURAGEMENT - Genuine, not empty:
BAD: "Great job!" / "Keep up the good work!" / "You're on the right track!"
GOOD: "You've taken on a complex topic and made a clear attempt to structure an argument - that's the foundation to build on."
GOOD: "This revision shows you addressed the feedback on thesis clarity from your last draft."
ACCEPTABLE: "With focused revision on the priority areas above, you can significantly strengthen this work."

=== CRITICAL RULES ===
1. Every piece of feedback must connect to the rubric criteria and levels
2. Never fabricate strengths - empty arrays are better than fake praise
3. Be direct about weaknesses - students need to know what to fix
4. Make suggestions specific enough that students know exactly what to do
5. The goal is improvement, not making students feel good about mediocre work

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
