/**
 * Student Routes — Student management, feedback release, and magic links
 *
 * CRUD for students, CSV import, linking students to submissions, and
 * releasing AI feedback via unique magic-link tokens. Also serves the
 * student-facing feedback view and a conversational chat endpoint for
 * follow-up questions, plus file resubmission. Mounted at /api/students.
 */
import { Router } from 'express';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import prisma from '../db/prisma.js';
import { extractTextFromFile } from '../services/textExtraction.js';
import { processResubmissionFeedback } from '../services/feedbackGeneration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Multer config for student resubmissions
const resubmitStorage = multer.diskStorage({
  destination: join(__dirname, '../../uploads/submissions'),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const resubmitUpload = multer({
  storage: resubmitStorage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const router = Router();

// Generate a unique feedback token
function generateToken(): string {
  return randomBytes(16).toString('hex');
}

// Get all students with their submissions
router.get('/', async (req, res) => {
  console.log('[STUDENTS] GET / - Fetching all students');
  try {
    const students = await prisma.student.findMany({
      include: {
        submissions: {
          select: {
            id: true,
            fileName: true,
            status: true,
            submittedAt: true,
            assignmentId: true,
            feedbackToken: true,
            feedbackReleased: true,
            feedbackViewedAt: true,
            assignment: { select: { id: true, name: true } }
          },
          orderBy: { submittedAt: 'desc' }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(students);
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Create a single student
router.post('/', async (req, res) => {
  console.log('[STUDENTS] POST / - Creating student');
  try {
    const { name, email, studentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const student = await prisma.student.create({
      data: { name, email: email || null, studentId: studentId || null }
    });

    res.status(201).json(student);
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// Bulk import students from CSV data
router.post('/import', async (req, res) => {
  console.log('[STUDENTS] POST /import - Importing students');
  try {
    const { students } = req.body; // Array of { name, email, studentId? }

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Students array is required' });
    }

    const created = [];
    const skipped = [];

    for (const s of students) {
      if (!s.name || !s.email) {
        skipped.push({ ...s, reason: 'Missing name or email' });
        continue;
      }

      // Check if student with this email already exists
      const existing = await prisma.student.findFirst({
        where: { email: s.email }
      });

      if (existing) {
        skipped.push({ ...s, reason: 'Email already exists' });
        continue;
      }

      const student = await prisma.student.create({
        data: {
          name: s.name,
          email: s.email,
          studentId: s.studentId || null
        }
      });
      created.push(student);
    }

    console.log(`[STUDENTS] Imported ${created.length}, skipped ${skipped.length}`);
    res.json({ created, skipped });
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to import students' });
  }
});

// Update a student
router.put('/:id', async (req, res) => {
  console.log(`[STUDENTS] PUT /${req.params.id}`);
  try {
    const { name, email, studentId } = req.body;

    const student = await prisma.student.update({
      where: { id: req.params.id },
      data: { name, email, studentId }
    });

    res.json(student);
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Delete a student
router.delete('/:id', async (req, res) => {
  console.log(`[STUDENTS] DELETE /${req.params.id}`);
  try {
    await prisma.student.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// Link a submission to a student
router.post('/link-submission', async (req, res) => {
  console.log('[STUDENTS] POST /link-submission');
  try {
    const { submissionId, studentId } = req.body;

    const submission = await prisma.submission.update({
      where: { id: submissionId },
      data: { studentId },
      include: { student: true }
    });

    res.json(submission);
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to link submission' });
  }
});

// Release feedback for an assignment (generate tokens and optionally email)
router.post('/release-feedback', async (req, res) => {
  console.log('[STUDENTS] POST /release-feedback');
  try {
    const { assignmentId, sendEmail } = req.body;

    // Get all submissions for this assignment that have students linked
    const submissions = await prisma.submission.findMany({
      where: {
        assignmentId,
        studentId: { not: null },
        status: 'ready' // Only release if feedback is ready
      },
      include: { student: true }
    });

    if (submissions.length === 0) {
      return res.status(400).json({
        error: 'No submissions ready to release. Make sure submissions have students linked and feedback is generated.'
      });
    }

    const released = [];
    const errors = [];

    for (const submission of submissions) {
      try {
        // Generate token if not exists
        let token = submission.feedbackToken;
        if (!token) {
          token = generateToken();
        }

        await prisma.submission.update({
          where: { id: submission.id },
          data: {
            feedbackToken: token,
            feedbackReleased: true
          }
        });

        const feedbackUrl = `/feedback/${token}`;

        released.push({
          submissionId: submission.id,
          studentName: submission.student?.name,
          studentEmail: submission.student?.email,
          feedbackUrl,
          token
        });

        // TODO: Send email if sendEmail is true
        // For now, just log
        if (sendEmail && submission.student?.email) {
          console.log(`[EMAIL] Would send to ${submission.student.email}: ${feedbackUrl}`);
        }
      } catch (err) {
        errors.push({ submissionId: submission.id, error: String(err) });
      }
    }

    console.log(`[STUDENTS] Released ${released.length} feedbacks`);
    res.json({ released, errors });
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to release feedback' });
  }
});

// Get feedback by token (public - for students)
router.get('/feedback/:token', async (req, res) => {
  console.log(`[STUDENTS] GET /feedback/${req.params.token}`);
  try {
    const submission = await prisma.submission.findFirst({
      where: {
        feedbackToken: req.params.token,
        feedbackReleased: true
      },
      include: {
        student: { select: { name: true } },
        assignment: { select: { name: true } },
        inlineComments: {
          include: { criterion: { select: { name: true } } }
        },
        sectionFeedback: {
          include: { criterion: { select: { name: true } } }
        },
        overallFeedback: true
      }
    });

    if (!submission) {
      return res.status(404).json({ error: 'Feedback not found or not yet released' });
    }

    // Mark as viewed if first time
    if (!submission.feedbackViewedAt) {
      await prisma.submission.update({
        where: { id: submission.id },
        data: { feedbackViewedAt: new Date() }
      });
    }

    // Find the latest revision (child submission) if any
    const revisions = await prisma.submission.findMany({
      where: { parentSubmissionId: submission.id },
      orderBy: { submittedAt: 'desc' },
      take: 1,
      include: {
        inlineComments: { include: { criterion: { select: { name: true } } } },
        sectionFeedback: { include: { criterion: { select: { name: true } } } },
        overallFeedback: true
      }
    });
    const latestRevision = revisions[0] ?? null;

    res.json({
      studentName: submission.student?.name,
      assignmentName: submission.assignment?.name,
      fileName: submission.fileName,
      extractedText: submission.extractedText,
      inlineComments: submission.inlineComments,
      sectionFeedback: submission.sectionFeedback,
      overallFeedback: submission.overallFeedback,
      latestRevision: latestRevision ? {
        id: latestRevision.id,
        fileName: latestRevision.fileName,
        status: latestRevision.status,
        submittedAt: latestRevision.submittedAt,
        extractedText: latestRevision.extractedText,
        inlineComments: latestRevision.inlineComments,
        sectionFeedback: latestRevision.sectionFeedback,
        overallFeedback: latestRevision.overallFeedback
      } : null
    });
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// Chat with AI about feedback (public - for students)
router.post('/feedback/:token/chat', async (req, res) => {
  console.log(`[STUDENTS] POST /feedback/${req.params.token}/chat`);
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI chat is not configured' });
    }

    // Load submission with all feedback + rubric context
    const submission = await prisma.submission.findFirst({
      where: {
        feedbackToken: req.params.token,
        feedbackReleased: true
      },
      include: {
        student: { select: { name: true } },
        assignment: {
          select: {
            name: true,
            rubric: {
              include: {
                criteria: {
                  include: { levels: { orderBy: { sortOrder: 'asc' } } },
                  orderBy: { sortOrder: 'asc' }
                }
              }
            }
          }
        },
        inlineComments: {
          include: { criterion: { select: { name: true } } }
        },
        sectionFeedback: {
          include: { criterion: { select: { name: true } } }
        },
        overallFeedback: true
      }
    });

    if (!submission) {
      return res.status(404).json({ error: 'Feedback not found or not yet released' });
    }

    // Build system prompt with full context
    const studentName = submission.student?.name || 'Student';
    const assignmentName = submission.assignment?.name || 'Assignment';

    let systemPrompt = `You are a knowledgeable tutor helping ${studentName} understand feedback on their assignment "${assignmentName}".

YOUR ROLE:
- Help the student UNDERSTAND the feedback by connecting it to specific rubric criteria and performance levels
- Explain WHY certain feedback was given - what's missing, what could be stronger, what the rubric requires
- Give SPECIFIC, ACTIONABLE guidance - not vague encouragement
- Be honest and direct - don't soften feedback to spare feelings
- If they ask how to improve, give concrete steps, not generic advice

TONE GUIDELINES:
- Be helpful and clear, but not artificially cheerful or overly encouraging
- Treat the student as capable of handling honest feedback
- Don't add unnecessary praise or validation - focus on being useful
- If the feedback says something is weak, explain why without sugarcoating
- It's okay to say "this needs significant work" if that's true

RESPONSE STYLE:
- Keep responses focused and concise (2-3 paragraphs max)
- Use specific examples from their submission when explaining feedback
- Reference the rubric levels to help them understand where they are and where they need to be
- If they ask a vague question, ask a clarifying question rather than giving a vague answer
- If they ask about something unrelated to their assignment/feedback, briefly redirect them
`;

    // Add rubric criteria
    const rubric = submission.assignment?.rubric;
    if (rubric && rubric.criteria.length > 0) {
      systemPrompt += '\n=== RUBRIC CRITERIA ===\n';
      for (const criterion of rubric.criteria) {
        systemPrompt += `**${criterion.name}**`;
        if (criterion.description) systemPrompt += `: ${criterion.description}`;
        systemPrompt += '\n';
        if (criterion.levels.length > 0) {
          systemPrompt += '  Levels:\n';
          for (const level of criterion.levels) {
            systemPrompt += `  - ${level.label}: ${level.description}\n`;
          }
        }
      }
    }

    // Add student's submission text (truncated)
    if (submission.extractedText) {
      const maxTextLength = 6000;
      const text = submission.extractedText.length > maxTextLength
        ? submission.extractedText.substring(0, maxTextLength) + '\n(truncated for length)'
        : submission.extractedText;
      systemPrompt += `\n=== STUDENT'S SUBMISSION ===\n${text}\n`;
    }

    // Add inline comments
    if (submission.inlineComments.length > 0) {
      systemPrompt += '\n=== INLINE COMMENTS ON SUBMISSION ===\n';
      for (const comment of submission.inlineComments) {
        const criterionName = comment.criterion?.name || 'General';
        systemPrompt += `- [${criterionName}] On text "${comment.highlightedText}": ${comment.comment}\n`;
      }
    }

    // Add section feedback
    if (submission.sectionFeedback.length > 0) {
      systemPrompt += '\n=== FEEDBACK BY CRITERIA ===\n';
      for (const section of submission.sectionFeedback) {
        systemPrompt += `**${section.criterion?.name}**:\n`;
        try {
          const strengths = JSON.parse(section.strengths);
          if (strengths.length > 0) systemPrompt += `  Strengths: ${strengths.join('; ')}\n`;
        } catch { /* skip */ }
        try {
          const growth = JSON.parse(section.areasForGrowth);
          if (growth.length > 0) systemPrompt += `  Areas for Growth: ${growth.join('; ')}\n`;
        } catch { /* skip */ }
        try {
          const suggestions = JSON.parse(section.suggestions);
          if (suggestions.length > 0) systemPrompt += `  Suggestions: ${suggestions.join('; ')}\n`;
        } catch { /* skip */ }
      }
    }

    // Add overall feedback
    if (submission.overallFeedback) {
      systemPrompt += '\n=== OVERALL FEEDBACK ===\n';
      systemPrompt += `Summary: ${submission.overallFeedback.summary}\n`;
      if (submission.overallFeedback.encouragement) {
        systemPrompt += `Encouragement: ${submission.overallFeedback.encouragement}\n`;
      }
      try {
        const improvements = JSON.parse(submission.overallFeedback.priorityImprovements);
        if (improvements.length > 0) systemPrompt += `Priority Improvements: ${improvements.join('; ')}\n`;
      } catch { /* skip */ }
      try {
        const nextSteps = JSON.parse(submission.overallFeedback.nextSteps);
        if (nextSteps.length > 0) systemPrompt += `Next Steps: ${nextSteps.join('; ')}\n`;
      } catch { /* skip */ }
    }

    // Build contents array from conversation history (cap at last 20 messages)
    const recentHistory = Array.isArray(history) ? history.slice(-20) : [];
    const contents = [
      ...recentHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: msg.content }]
      })),
      {
        role: 'user' as const,
        parts: [{ text: message.trim() }]
      }
    ];

    // Call Gemini
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents,
      config: {
        systemInstruction: systemPrompt
      }
    });

    const responseText = response.text || 'I apologize, but I was unable to generate a response. Please try again.';

    res.json({ response: responseText });
  } catch (error: any) {
    console.error('[STUDENTS] Chat error:', error);

    if (error?.status === 429) {
      const isDailyQuota = error?.message?.includes('free_tier') || error?.message?.includes('FreeTier');
      if (isDailyQuota) {
        return res.status(429).json({ error: 'The AI assistant is temporarily unavailable due to daily usage limits. Please try again tomorrow.' });
      }
      return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    }

    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Resubmit a revision (public - for students)
router.post('/feedback/:token/resubmit', resubmitUpload.single('file'), async (req, res) => {
  console.log(`[STUDENTS] POST /feedback/${req.params.token}/resubmit`);
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Find original submission by token
    const original = await prisma.submission.findFirst({
      where: {
        feedbackToken: req.params.token,
        feedbackReleased: true
      },
      select: {
        id: true,
        studentId: true,
        assignmentId: true,
        student: { select: { name: true } },
        assignment: { select: { name: true } }
      }
    });

    if (!original) {
      return res.status(404).json({ error: 'Feedback not found or not yet released' });
    }

    if (!original.assignmentId) {
      return res.status(400).json({ error: 'Original submission is not linked to an assignment' });
    }

    // Extract text from uploaded file
    const extractedText = await extractTextFromFile(req.file.path, req.file.originalname);

    // Create new submission linked to same student + assignment + parent
    const newSubmission = await prisma.submission.create({
      data: {
        fileName: req.file.originalname,
        filePath: req.file.path,
        extractedText,
        status: 'pending',
        assignmentId: original.assignmentId,
        studentId: original.studentId,
        parentSubmissionId: original.id
      }
    });

    console.log(`[STUDENTS] Resubmission created: ${newSubmission.id} for student ${original.student?.name}`);

    // Trigger auto-grading asynchronously (fire-and-forget)
    processResubmissionFeedback(newSubmission.id).catch(err =>
      console.error('[RESUBMIT] Auto-grading failed:', err)
    );

    res.json({
      success: true,
      message: 'Your revision has been submitted and is being graded. Check back shortly for updated feedback.',
      submissionId: newSubmission.id
    });
  } catch (error) {
    console.error('[STUDENTS] Resubmit error:', error);
    res.status(500).json({ error: 'Failed to submit revision' });
  }
});

export default router;
