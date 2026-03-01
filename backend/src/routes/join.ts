/**
 * Join Routes — Student self-service endpoints for joining assignments
 *
 * Provides a student-facing API mounted at /api/join/:code:
 *   GET    /:code                         — resolve code → assignment + student list
 *   POST   /:code/students                — create a student record
 *   POST   /:code/submit                  — upload essay, creates submission + fires feedback
 *   GET    /:code/student/:studentId      — poll submission status / fetch feedback
 *   POST   /:code/student/:studentId/resubmit — submit a revision
 */
import { Router } from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import prisma from '../db/prisma.js';
import { extractTextFromFile } from '../services/textExtraction.js';
import { processAssignmentFeedback, processResubmissionFeedback } from '../services/feedbackGeneration.js';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const storage = multer.diskStorage({
  destination: join(__dirname, '../../uploads/submissions'),
  filename: (_req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, suffix + '-' + file.originalname);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// Resolve a join code to assignment info + existing students
router.get('/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  console.log(`[JOIN] GET /${code}`);
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { joinCode: code },
      select: {
        id: true,
        name: true,
        dueDate: true,
        submissions: {
          where: { studentId: { not: null }, parentSubmissionId: null },
          select: { student: { select: { id: true, name: true } } },
          distinct: ['studentId'],
          orderBy: { submittedAt: 'desc' }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found. Check your join code.' });
    }

    const students = assignment.submissions
      .map(s => s.student)
      .filter((s): s is { id: string; name: string } => s !== null);

    // Deduplicate (multiple submissions from same student)
    const seen = new Set<string>();
    const uniqueStudents = students.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    res.json({
      assignmentId: assignment.id,
      assignmentName: assignment.name,
      dueDate: assignment.dueDate,
      students: uniqueStudents
    });
  } catch (error) {
    console.error('[JOIN] Error:', error);
    res.status(500).json({ error: 'Failed to load assignment' });
  }
});

// Create a new student for this assignment
router.post('/:code/students', async (req, res) => {
  const code = req.params.code.toUpperCase();
  console.log(`[JOIN] POST /${code}/students`);
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const assignment = await prisma.assignment.findUnique({ where: { joinCode: code } });
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const student = await prisma.student.create({
      data: { name: name.trim() }
    });

    res.status(201).json({ id: student.id, name: student.name });
  } catch (error) {
    console.error('[JOIN] Error:', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// Submit an essay (initial submission)
router.post('/:code/submit', upload.single('file'), async (req, res) => {
  const code = req.params.code.toUpperCase();
  console.log(`[JOIN] POST /${code}/submit`);
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required' });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { joinCode: code },
      select: { id: true, teacherPreferences: true }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Check no existing root submission for this student + assignment
    const existing = await prisma.submission.findFirst({
      where: {
        assignmentId: assignment.id,
        studentId,
        parentSubmissionId: null
      }
    });

    if (existing) {
      return res.status(400).json({
        error: 'You have already submitted for this assignment. Use resubmit to upload a revision.',
        existingSubmissionId: existing.id
      });
    }

    const extractedText = await extractTextFromFile(req.file.path, req.file.originalname);

    const submission = await prisma.submission.create({
      data: {
        fileName: req.file.originalname,
        filePath: req.file.path,
        extractedText,
        status: 'pending',
        assignmentId: assignment.id,
        studentId
      }
    });

    console.log(`[JOIN] Created submission ${submission.id} for student ${studentId}`);

    // Fire feedback generation asynchronously
    processAssignmentFeedback(assignment.id, assignment.teacherPreferences ?? undefined, [submission.id]).catch(err =>
      console.error('[JOIN] Feedback generation error:', err)
    );

    res.json({ submissionId: submission.id });
  } catch (error) {
    console.error('[JOIN] Error:', error);
    res.status(500).json({ error: 'Failed to submit' });
  }
});

// Get a student's submission status and feedback for this assignment
router.get('/:code/student/:studentId', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { studentId } = req.params;
  console.log(`[JOIN] GET /${code}/student/${studentId}`);
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { joinCode: code },
      select: { id: true, name: true }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Find the root submission (latest, no parent)
    const submission = await prisma.submission.findFirst({
      where: {
        assignmentId: assignment.id,
        studentId,
        parentSubmissionId: null
      },
      orderBy: { submittedAt: 'desc' },
      include: {
        student: { select: { name: true } },
        inlineComments: { include: { criterion: { select: { name: true } } } },
        sectionFeedback: { include: { criterion: { select: { name: true } } } },
        overallFeedback: true
      }
    });

    if (!submission) {
      return res.json({ hasSubmission: false, assignmentName: assignment.name });
    }

    // Find latest revision if any
    const latestRevision = await prisma.submission.findFirst({
      where: { parentSubmissionId: submission.id },
      orderBy: { submittedAt: 'desc' },
      include: {
        inlineComments: { include: { criterion: { select: { name: true } } } },
        sectionFeedback: { include: { criterion: { select: { name: true } } } },
        overallFeedback: true
      }
    });

    res.json({
      hasSubmission: true,
      assignmentName: assignment.name,
      studentName: submission.student?.name,
      submission: {
        id: submission.id,
        status: submission.status,
        fileName: submission.fileName,
        extractedText: submission.extractedText,
        submittedAt: submission.submittedAt,
        inlineComments: submission.inlineComments,
        sectionFeedback: submission.sectionFeedback,
        overallFeedback: submission.overallFeedback,
        latestRevision: latestRevision ? {
          id: latestRevision.id,
          status: latestRevision.status,
          fileName: latestRevision.fileName,
          submittedAt: latestRevision.submittedAt,
          extractedText: latestRevision.extractedText,
          inlineComments: latestRevision.inlineComments,
          sectionFeedback: latestRevision.sectionFeedback,
          overallFeedback: latestRevision.overallFeedback
        } : null
      }
    });
  } catch (error) {
    console.error('[JOIN] Error:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Resubmit a revision
router.post('/:code/student/:studentId/resubmit', upload.single('file'), async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { studentId } = req.params;
  console.log(`[JOIN] POST /${code}/student/${studentId}/resubmit`);
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { joinCode: code },
      select: { id: true }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Find original root submission
    const original = await prisma.submission.findFirst({
      where: {
        assignmentId: assignment.id,
        studentId,
        parentSubmissionId: null
      },
      orderBy: { submittedAt: 'desc' }
    });

    if (!original) {
      return res.status(404).json({ error: 'No original submission found' });
    }

    const extractedText = await extractTextFromFile(req.file.path, req.file.originalname);

    const revision = await prisma.submission.create({
      data: {
        fileName: req.file.originalname,
        filePath: req.file.path,
        extractedText,
        status: 'pending',
        assignmentId: assignment.id,
        studentId,
        parentSubmissionId: original.id
      }
    });

    console.log(`[JOIN] Created revision ${revision.id} for student ${studentId}`);

    processResubmissionFeedback(revision.id).catch(err =>
      console.error('[JOIN] Resubmission feedback error:', err)
    );

    res.json({ submissionId: revision.id });
  } catch (error) {
    console.error('[JOIN] Error:', error);
    res.status(500).json({ error: 'Failed to resubmit' });
  }
});

// Chat about feedback
router.post('/:code/student/:studentId/chat', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const { studentId } = req.params;
  console.log(`[JOIN] POST /${code}/student/${studentId}/chat`);
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI chat is not configured' });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { joinCode: code },
      select: { id: true, name: true }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const submission = await prisma.submission.findFirst({
      where: { assignmentId: assignment.id, studentId, parentSubmissionId: null },
      orderBy: { submittedAt: 'desc' },
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
        inlineComments: { include: { criterion: { select: { name: true } } } },
        sectionFeedback: { include: { criterion: { select: { name: true } } } },
        overallFeedback: true
      }
    });

    if (!submission) {
      return res.status(404).json({ error: 'No submission found' });
    }

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

RESPONSE STYLE:
- Keep responses focused and concise (2-3 paragraphs max)
- Use specific examples from their submission when explaining feedback
- Reference the rubric levels to help them understand where they are and where they need to be
- If they ask a vague question, ask a clarifying question rather than giving a vague answer
- If they ask about something unrelated to their assignment/feedback, briefly redirect them
`;

    const rubric = submission.assignment?.rubric;
    if (rubric && rubric.criteria.length > 0) {
      systemPrompt += '\n=== RUBRIC CRITERIA ===\n';
      for (const criterion of rubric.criteria) {
        systemPrompt += `**${criterion.name}**`;
        if (criterion.description) systemPrompt += `: ${criterion.description}`;
        systemPrompt += '\n';
        if (criterion.levels.length > 0) {
          for (const level of criterion.levels) {
            systemPrompt += `  - ${level.label}: ${level.description}\n`;
          }
        }
      }
    }

    if (submission.extractedText) {
      const maxLen = 6000;
      const text = submission.extractedText.length > maxLen
        ? submission.extractedText.substring(0, maxLen) + '\n(truncated for length)'
        : submission.extractedText;
      systemPrompt += `\n=== STUDENT'S SUBMISSION ===\n${text}\n`;
    }

    if (submission.inlineComments.length > 0) {
      systemPrompt += '\n=== INLINE COMMENTS ON SUBMISSION ===\n';
      for (const c of submission.inlineComments) {
        systemPrompt += `- [${c.criterion?.name || 'General'}] On text "${c.highlightedText}": ${c.comment}\n`;
      }
    }

    if (submission.sectionFeedback.length > 0) {
      systemPrompt += '\n=== FEEDBACK BY CRITERIA ===\n';
      for (const section of submission.sectionFeedback) {
        systemPrompt += `**${section.criterion?.name}**:\n`;
        try { const s = JSON.parse(section.strengths); if (s.length) systemPrompt += `  Strengths: ${s.join('; ')}\n`; } catch { /* skip */ }
        try { const g = JSON.parse(section.areasForGrowth); if (g.length) systemPrompt += `  Areas for Growth: ${g.join('; ')}\n`; } catch { /* skip */ }
        try { const sg = JSON.parse(section.suggestions); if (sg.length) systemPrompt += `  Suggestions: ${sg.join('; ')}\n`; } catch { /* skip */ }
      }
    }

    if (submission.overallFeedback) {
      systemPrompt += '\n=== OVERALL FEEDBACK ===\n';
      systemPrompt += `Summary: ${submission.overallFeedback.summary}\n`;
      if (submission.overallFeedback.encouragement) systemPrompt += `Encouragement: ${submission.overallFeedback.encouragement}\n`;
      try { const imp = JSON.parse(submission.overallFeedback.priorityImprovements); if (imp.length) systemPrompt += `Priority Improvements: ${imp.join('; ')}\n`; } catch { /* skip */ }
      try { const ns = JSON.parse(submission.overallFeedback.nextSteps); if (ns.length) systemPrompt += `Next Steps: ${ns.join('; ')}\n`; } catch { /* skip */ }
    }

    const recentHistory = Array.isArray(history) ? history.slice(-20) : [];
    const contents = [
      ...recentHistory.map((msg: { role: string; content: string }) => ({
        role: msg.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: msg.content }]
      })),
      { role: 'user' as const, parts: [{ text: message.trim() }] }
    ];

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents,
      config: { systemInstruction: systemPrompt }
    });

    res.json({ response: response.text || 'Unable to generate a response. Please try again.' });
  } catch (error: any) {
    console.error('[JOIN] Chat error:', error);
    if (error?.status === 429) {
      return res.status(429).json({ error: 'AI chat is temporarily unavailable due to usage limits. Please try again later.' });
    }
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

export default router;
