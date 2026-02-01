import { Router } from 'express';
import { randomBytes } from 'crypto';
import prisma from '../db/prisma.js';

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

    res.json({
      studentName: submission.student?.name,
      assignmentName: submission.assignment?.name,
      fileName: submission.fileName,
      extractedText: submission.extractedText,
      inlineComments: submission.inlineComments,
      sectionFeedback: submission.sectionFeedback,
      overallFeedback: submission.overallFeedback
    });
  } catch (error) {
    console.error('[STUDENTS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

export default router;
