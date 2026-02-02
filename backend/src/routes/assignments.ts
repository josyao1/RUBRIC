import { Router } from 'express';
import prisma from '../db/prisma.js';
import { processAssignmentFeedback } from '../services/feedbackGeneration.js';

const router = Router();

// Get all assignments with rubric info
router.get('/', async (req, res) => {
  console.log('[ASSIGNMENTS] GET / - Fetching all assignments');
  try {
    const assignments = await prisma.assignment.findMany({
      include: {
        rubric: {
          select: { id: true, name: true }
        },
        _count: {
          select: { submissions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const transformed = assignments.map(a => ({
      id: a.id,
      name: a.name,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
      rubricId: a.rubricId,
      rubricName: a.rubric?.name || null,
      submissionCount: a._count.submissions,
      gradingStatus: a.gradingStatus,
      gradingProgress: a.gradingProgress,
      gradingTotal: a.gradingTotal
    }));

    console.log(`[ASSIGNMENTS] Found ${transformed.length} assignments`);
    res.json(transformed);
  } catch (error) {
    console.error('[ASSIGNMENTS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// Get single assignment with submissions and student info
router.get('/:id', async (req, res) => {
  console.log(`[ASSIGNMENTS] GET /${req.params.id}`);
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.id },
      include: {
        rubric: {
          include: {
            criteria: {
              include: { levels: { orderBy: { sortOrder: 'asc' } } },
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        submissions: {
          include: {
            student: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { submittedAt: 'desc' }
        }
      }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Transform submissions to include student name
    const transformed = {
      ...assignment,
      rubricName: assignment.rubric?.name || null,
      submissions: assignment.submissions.map(s => ({
        id: s.id,
        fileName: s.fileName,
        status: s.status,
        submittedAt: s.submittedAt,
        studentId: s.studentId,
        studentName: s.student?.name || null,
        studentEmail: s.student?.email || null,
        feedbackReleased: s.feedbackReleased,
        feedbackViewedAt: s.feedbackViewedAt
      }))
    };

    res.json(transformed);
  } catch (error) {
    console.error('[ASSIGNMENTS] Error:', error);
    res.status(500).json({ error: 'Failed to fetch assignment' });
  }
});

// Create assignment
router.post('/', async (req, res) => {
  console.log('[ASSIGNMENTS] POST / - Creating assignment');
  try {
    const { name, rubricId, dueDate } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const assignment = await prisma.assignment.create({
      data: {
        name,
        rubricId: rubricId || null,
        dueDate: dueDate ? new Date(dueDate) : null
      },
      include: {
        rubric: {
          select: { id: true, name: true }
        }
      }
    });

    console.log(`[ASSIGNMENTS] Created: ${assignment.id}`);

    res.status(201).json({
      id: assignment.id,
      name: assignment.name,
      dueDate: assignment.dueDate,
      createdAt: assignment.createdAt,
      rubricId: assignment.rubricId,
      rubricName: assignment.rubric?.name || null,
      submissionCount: 0
    });
  } catch (error) {
    console.error('[ASSIGNMENTS] Error:', error);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// Update assignment
router.put('/:id', async (req, res) => {
  console.log(`[ASSIGNMENTS] PUT /${req.params.id}`);
  try {
    const { name, rubricId, dueDate } = req.body;

    const assignment = await prisma.assignment.update({
      where: { id: req.params.id },
      data: {
        name,
        rubricId: rubricId || null,
        dueDate: dueDate ? new Date(dueDate) : null
      },
      include: {
        rubric: {
          select: { id: true, name: true }
        },
        _count: {
          select: { submissions: true }
        }
      }
    });

    res.json({
      id: assignment.id,
      name: assignment.name,
      dueDate: assignment.dueDate,
      createdAt: assignment.createdAt,
      rubricId: assignment.rubricId,
      rubricName: assignment.rubric?.name || null,
      submissionCount: assignment._count.submissions
    });
  } catch (error) {
    console.error('[ASSIGNMENTS] Error:', error);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// Delete assignment
router.delete('/:id', async (req, res) => {
  console.log(`[ASSIGNMENTS] DELETE /${req.params.id}`);
  try {
    await prisma.assignment.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[ASSIGNMENTS] Error:', error);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

// Start grading pipeline for an assignment
router.post('/:id/start-grading', async (req, res) => {
  console.log(`[ASSIGNMENTS] POST /${req.params.id}/start-grading`);
  try {
    const { teacherPreferences } = req.body;

    // Check assignment exists and has a rubric
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.id },
      include: {
        rubric: true,
        _count: { select: { submissions: true } }
      }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (!assignment.rubric) {
      return res.status(400).json({ error: 'Assignment has no rubric linked. Please link a rubric first.' });
    }

    if (assignment._count.submissions === 0) {
      return res.status(400).json({ error: 'No submissions to grade. Upload student work first.' });
    }

    if (assignment.gradingStatus === 'in_progress') {
      return res.status(400).json({ error: 'Grading is already in progress for this assignment.' });
    }

    // Start the grading process in the background
    console.log(`[GRADING] Starting feedback generation for ${assignment._count.submissions} submissions`);

    // Don't await - let it run in the background
    processAssignmentFeedback(req.params.id, teacherPreferences).catch(error => {
      console.error('[GRADING] Background process error:', error);
      // Update status to error
      prisma.assignment.update({
        where: { id: req.params.id },
        data: { gradingStatus: 'error' }
      }).catch(console.error);
    });

    res.json({
      success: true,
      message: 'Grading started',
      totalSubmissions: assignment._count.submissions
    });
  } catch (error) {
    console.error('[ASSIGNMENTS] Error:', error);
    res.status(500).json({ error: 'Failed to start grading' });
  }
});

// Get grading status for an assignment
router.get('/:id/grading-status', async (req, res) => {
  console.log(`[ASSIGNMENTS] GET /${req.params.id}/grading-status`);
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.id },
      select: {
        gradingStatus: true,
        gradingProgress: true,
        gradingTotal: true
      }
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json(assignment);
  } catch (error) {
    console.error('[ASSIGNMENTS] Error:', error);
    res.status(500).json({ error: 'Failed to get grading status' });
  }
});

export default router;
