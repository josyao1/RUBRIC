import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import prisma from '../db/prisma.js';

// Handle CommonJS modules in ESM
const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: join(__dirname, '../../uploads/submissions'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Get all submissions
router.get('/', async (req, res) => {
  console.log('[SUBMISSIONS] GET / - Fetching all submissions');
  try {
    const submissions = await prisma.submission.findMany({
      include: {
        student: true,
        assignment: true
      },
      orderBy: { submittedAt: 'desc' }
    });

    const transformed = submissions.map(s => ({
      ...s,
      studentName: s.student?.name,
      assignmentName: s.assignment?.name
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Upload submission(s)
router.post('/upload', upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const { assignmentId } = req.body;
    const submissions = [];

    for (const file of req.files) {
      const ext = extname(file.originalname).toLowerCase();

      // Extract text based on file type
      let extractedText = '';
      try {
        if (['.txt', '.py', '.java', '.js', '.ts', '.cpp', '.c', '.html', '.css', '.md'].includes(ext)) {
          extractedText = readFileSync(file.path, 'utf-8');
        } else if (ext === '.pdf') {
          const pdfParse = require('pdf-parse');
          const pdfBuffer = readFileSync(file.path);
          const pdfData = await pdfParse(pdfBuffer);
          extractedText = pdfData.text;
        } else if (ext === '.docx' || ext === '.doc') {
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ path: file.path });
          extractedText = result.value;
        } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
          // OCR for images (e.g., scanned handwritten work)
          const Tesseract = await import('tesseract.js');
          const { data: { text } } = await Tesseract.recognize(file.path, 'eng');
          extractedText = text;
        }
      } catch (parseError) {
        console.error('Error parsing file:', parseError);
        extractedText = '(Could not extract text)';
      }

      // Don't auto-link students - let teachers do it manually
      const submission = await prisma.submission.create({
        data: {
          fileName: file.originalname,
          filePath: file.path,
          extractedText,
          status: 'pending',
          assignmentId: assignmentId || null,
          studentId: null
        }
      });

      submissions.push({
        id: submission.id,
        fileName: file.originalname,
        status: 'pending'
      });
    }

    res.json({ submissions });
  } catch (error) {
    console.error('Error uploading submissions:', error);
    res.status(500).json({ error: 'Failed to upload submissions' });
  }
});

// Helper to extract student name from filename
function extractStudentFromFilename(filename: string): string | null {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  const patterns = [
    /^([A-Za-z]+)_([A-Za-z]+)/,  // LastName_FirstName
    /^([A-Za-z]+)-([A-Za-z]+)/,  // LastName-FirstName
    /^([A-Za-z]+)\s+([A-Za-z]+)/, // FirstName LastName
  ];

  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      return `${match[2]} ${match[1]}`;
    }
  }

  return null;
}

// Get single submission with feedback
router.get('/:id', async (req, res) => {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: {
        student: true,
        inlineComments: {
          include: { criterion: true }
        },
        sectionFeedback: {
          include: { criterion: true }
        },
        overallFeedback: true
      }
    });

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    res.json({
      ...submission,
      studentName: submission.student?.name
    });
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Update submission status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    await prisma.submission.update({
      where: { id: req.params.id },
      data: { status }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({ error: 'Failed to update submission' });
  }
});

// Delete submission
router.delete('/:id', async (req, res) => {
  try {
    await prisma.submission.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

export default router;
