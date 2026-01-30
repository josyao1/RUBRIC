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
  destination: join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt'];
    const ext = extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all rubrics
router.get('/', (req, res) => {
  try {
    const rubrics = db.prepare(`
      SELECT r.*,
        (SELECT json_group_array(json_object(
          'id', c.id,
          'name', c.name,
          'description', c.description,
          'maxPoints', c.max_points,
          'order', c.sort_order
        )) FROM criteria c WHERE c.rubric_id = r.id ORDER BY c.sort_order) as criteria
      FROM rubrics r
      ORDER BY r.created_at DESC
    `).all();

    // Parse criteria JSON
    const parsed = rubrics.map((r: any) => ({
      ...r,
      criteria: JSON.parse(r.criteria || '[]')
    }));

    res.json(parsed);
  } catch (error) {
    console.error('Error fetching rubrics:', error);
    res.status(500).json({ error: 'Failed to fetch rubrics' });
  }
});

// Get single rubric
router.get('/:id', (req, res) => {
  try {
    const rubric = db.prepare(`
      SELECT * FROM rubrics WHERE id = ?
    `).get(req.params.id) as Record<string, unknown> | undefined;

    if (!rubric) {
      return res.status(404).json({ error: 'Rubric not found' });
    }

    const criteria = db.prepare(`
      SELECT * FROM criteria WHERE rubric_id = ? ORDER BY sort_order
    `).all(req.params.id);

    res.json({ ...rubric, criteria });
  } catch (error) {
    console.error('Error fetching rubric:', error);
    res.status(500).json({ error: 'Failed to fetch rubric' });
  }
});

// Upload rubric file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const id = uuidv4();
    const fileName = req.file.originalname;
    const filePath = req.file.path;
    const ext = extname(fileName).toLowerCase();

    // Extract text based on file type
    let rawContent = '';
    try {
      if (ext === '.txt' || ext === '.csv') {
        rawContent = readFileSync(filePath, 'utf-8');
      } else if (ext === '.pdf') {
        // PDF parsing - will need pdf-parse
        const pdfParse = (await import('pdf-parse')).default;
        const pdfBuffer = readFileSync(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        rawContent = pdfData.text;
      } else if (ext === '.docx') {
        // DOCX parsing - will need mammoth
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        rawContent = result.value;
      }
    } catch (parseError) {
      console.error('Error parsing file:', parseError);
      rawContent = '(Could not extract text from file)';
    }

    // Create rubric entry (criteria will be added after AI parsing or manual entry)
    const rubricName = fileName.replace(/\.[^/.]+$/, '');

    db.prepare(`
      INSERT INTO rubrics (id, name, description, source_file, raw_content)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, rubricName, 'Uploaded rubric - awaiting parsing', filePath, rawContent);

    const rubric = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(id) as Record<string, unknown>;

    res.json({
      ...rubric,
      criteria: [],
      rawContent // Send raw content so frontend can display it
    });
  } catch (error) {
    console.error('Error uploading rubric:', error);
    res.status(500).json({ error: 'Failed to upload rubric' });
  }
});

// Create rubric manually
router.post('/', (req, res) => {
  try {
    const { name, description, criteria } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const id = uuidv4();

    db.prepare(`
      INSERT INTO rubrics (id, name, description)
      VALUES (?, ?, ?)
    `).run(id, name, description || '');

    // Insert criteria
    if (criteria && Array.isArray(criteria)) {
      const insertCriterion = db.prepare(`
        INSERT INTO criteria (id, rubric_id, name, description, max_points, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      criteria.forEach((c: any, index: number) => {
        insertCriterion.run(
          uuidv4(),
          id,
          c.name || '',
          c.description || '',
          c.maxPoints || 10,
          index
        );
      });
    }

    const rubric = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(id) as Record<string, unknown>;
    const savedCriteria = db.prepare('SELECT * FROM criteria WHERE rubric_id = ? ORDER BY sort_order').all(id);

    res.status(201).json({ ...rubric, criteria: savedCriteria });
  } catch (error) {
    console.error('Error creating rubric:', error);
    res.status(500).json({ error: 'Failed to create rubric' });
  }
});

// Update rubric
router.put('/:id', (req, res) => {
  try {
    const { name, description, criteria } = req.body;
    const { id } = req.params;

    db.prepare(`
      UPDATE rubrics SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, description, id);

    // Replace criteria
    if (criteria && Array.isArray(criteria)) {
      db.prepare('DELETE FROM criteria WHERE rubric_id = ?').run(id);

      const insertCriterion = db.prepare(`
        INSERT INTO criteria (id, rubric_id, name, description, max_points, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      criteria.forEach((c: any, index: number) => {
        insertCriterion.run(
          c.id || uuidv4(),
          id,
          c.name || '',
          c.description || '',
          c.maxPoints || 10,
          index
        );
      });
    }

    const rubric = db.prepare('SELECT * FROM rubrics WHERE id = ?').get(id) as Record<string, unknown>;
    const savedCriteria = db.prepare('SELECT * FROM criteria WHERE rubric_id = ? ORDER BY sort_order').all(id);

    res.json({ ...rubric, criteria: savedCriteria });
  } catch (error) {
    console.error('Error updating rubric:', error);
    res.status(500).json({ error: 'Failed to update rubric' });
  }
});

// Delete rubric
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM rubrics WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting rubric:', error);
    res.status(500).json({ error: 'Failed to delete rubric' });
  }
});

export default router;
