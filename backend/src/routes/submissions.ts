import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readFileSync } from 'fs';
import db from '../db/database.js';

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
router.get('/', (req, res) => {
  try {
    const submissions = db.prepare(`
      SELECT s.*, st.name as student_name, a.name as assignment_name
      FROM submissions s
      LEFT JOIN students st ON s.student_id = st.id
      LEFT JOIN assignments a ON s.assignment_id = a.id
      ORDER BY s.submitted_at DESC
    `).all();

    res.json(submissions);
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
      const id = uuidv4();
      const ext = extname(file.originalname).toLowerCase();

      // Extract text based on file type
      let extractedText = '';
      try {
        if (['.txt', '.py', '.java', '.js', '.ts', '.cpp', '.c', '.html', '.css'].includes(ext)) {
          extractedText = readFileSync(file.path, 'utf-8');
        } else if (ext === '.pdf') {
          const pdfParse = (await import('pdf-parse')).default;
          const pdfBuffer = readFileSync(file.path);
          const pdfData = await pdfParse(pdfBuffer);
          extractedText = pdfData.text;
        } else if (ext === '.docx') {
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ path: file.path });
          extractedText = result.value;
        }
      } catch (parseError) {
        console.error('Error parsing file:', parseError);
        extractedText = '(Could not extract text)';
      }

      // Try to extract student name from filename
      const studentName = extractStudentFromFilename(file.originalname);

      // Create or find student
      let studentId = null;
      if (studentName) {
        let student = db.prepare('SELECT id FROM students WHERE name = ?').get(studentName) as { id: string } | undefined;
        if (!student) {
          studentId = uuidv4();
          db.prepare('INSERT INTO students (id, name) VALUES (?, ?)').run(studentId, studentName);
        } else {
          studentId = student.id;
        }
      }

      db.prepare(`
        INSERT INTO submissions (id, assignment_id, student_id, file_name, file_path, extracted_text, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `).run(id, assignmentId || null, studentId, file.originalname, file.path, extractedText);

      submissions.push({
        id,
        fileName: file.originalname,
        studentName,
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
  // Remove extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

  // Common patterns: "LastName_FirstName_Assignment", "FirstName LastName", etc.
  const patterns = [
    /^([A-Za-z]+)_([A-Za-z]+)/,  // LastName_FirstName
    /^([A-Za-z]+)-([A-Za-z]+)/,  // LastName-FirstName
    /^([A-Za-z]+)\s+([A-Za-z]+)/, // FirstName LastName
  ];

  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern);
    if (match) {
      return `${match[2]} ${match[1]}`; // Return as "FirstName LastName"
    }
  }

  return null;
}

// Get single submission with grades
router.get('/:id', (req, res) => {
  try {
    const submission = db.prepare(`
      SELECT s.*, st.name as student_name
      FROM submissions s
      LEFT JOIN students st ON s.student_id = st.id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const grades = db.prepare(`
      SELECT g.*, c.name as criterion_name, c.max_points
      FROM grades g
      JOIN criteria c ON g.criterion_id = c.id
      WHERE g.submission_id = ?
    `).all(req.params.id);

    const overallFeedback = db.prepare(`
      SELECT * FROM overall_feedback WHERE submission_id = ?
    `).get(req.params.id);

    res.json({ ...submission, grades, overallFeedback });
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Failed to fetch submission' });
  }
});

// Update submission status
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({ error: 'Failed to update submission' });
  }
});

// Delete submission
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM submissions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

export default router;
