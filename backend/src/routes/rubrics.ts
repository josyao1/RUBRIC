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
  destination: join(__dirname, '../../uploads'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.webp', '.txt'];
    const ext = extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Supported: PDF, Word (.docx), Images (.png, .jpg), Text (.txt)'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all rubrics
router.get('/', async (req, res) => {
  try {
    const rubrics = await prisma.rubric.findMany({
      include: {
        criteria: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform to match frontend expected format
    const transformed = rubrics.map(r => ({
      ...r,
      criteria: r.criteria.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        maxPoints: c.maxPoints,
        order: c.sortOrder
      }))
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Error fetching rubrics:', error);
    res.status(500).json({ error: 'Failed to fetch rubrics' });
  }
});

// Get single rubric
router.get('/:id', async (req, res) => {
  try {
    const rubric = await prisma.rubric.findUnique({
      where: { id: req.params.id },
      include: {
        criteria: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!rubric) {
      return res.status(404).json({ error: 'Rubric not found' });
    }

    res.json({
      ...rubric,
      criteria: rubric.criteria.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        maxPoints: c.maxPoints,
        order: c.sortOrder
      }))
    });
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

    const fileName = req.file.originalname;
    const filePath = req.file.path;
    const ext = extname(fileName).toLowerCase();

    // Extract text based on file type
    let rawContent = '';
    try {
      if (ext === '.txt') {
        rawContent = readFileSync(filePath, 'utf-8');
      } else if (ext === '.pdf') {
        const pdfParse = require('pdf-parse');
        const pdfBuffer = readFileSync(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        rawContent = pdfData.text;
      } else if (ext === '.docx' || ext === '.doc') {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        rawContent = result.value;
      } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        // OCR for images using Tesseract.js
        const Tesseract = await import('tesseract.js');
        const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
          logger: m => console.log(m) // Optional: log progress
        });
        rawContent = text;
      }
    } catch (parseError) {
      console.error('Error parsing file:', parseError);
      rawContent = '(Could not extract text from file)';
    }

    const rubricName = fileName.replace(/\.[^/.]+$/, '');

    const rubric = await prisma.rubric.create({
      data: {
        name: rubricName,
        description: 'Uploaded rubric - awaiting parsing',
        sourceFile: filePath,
        rawContent: rawContent
        // userId omitted until auth is implemented
      },
      include: {
        criteria: true
      }
    });

    res.json({
      ...rubric,
      criteria: [],
      rawContent
    });
  } catch (error) {
    console.error('Error uploading rubric:', error);
    res.status(500).json({ error: 'Failed to upload rubric' });
  }
});

// Create rubric manually
router.post('/', async (req, res) => {
  try {
    const { name, description, criteria } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const rubric = await prisma.rubric.create({
      data: {
        name,
        description: description || '',
        // userId omitted until auth is implemented
        criteria: {
          create: (criteria || []).map((c: any, index: number) => ({
            name: c.name || '',
            description: c.description || '',
            maxPoints: c.maxPoints || 10,
            sortOrder: index
          }))
        }
      },
      include: {
        criteria: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    res.status(201).json({
      ...rubric,
      criteria: rubric.criteria.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        maxPoints: c.maxPoints,
        order: c.sortOrder
      }))
    });
  } catch (error) {
    console.error('Error creating rubric:', error);
    res.status(500).json({ error: 'Failed to create rubric' });
  }
});

// Update rubric
router.put('/:id', async (req, res) => {
  try {
    const { name, description, criteria } = req.body;
    const { id } = req.params;

    // Delete existing criteria and replace
    await prisma.criterion.deleteMany({
      where: { rubricId: id }
    });

    const rubric = await prisma.rubric.update({
      where: { id },
      data: {
        name,
        description,
        criteria: {
          create: (criteria || []).map((c: any, index: number) => ({
            name: c.name || '',
            description: c.description || '',
            maxPoints: c.maxPoints || 10,
            sortOrder: index
          }))
        }
      },
      include: {
        criteria: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    res.json({
      ...rubric,
      criteria: rubric.criteria.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        maxPoints: c.maxPoints,
        order: c.sortOrder
      }))
    });
  } catch (error) {
    console.error('Error updating rubric:', error);
    res.status(500).json({ error: 'Failed to update rubric' });
  }
});

// Delete rubric
router.delete('/:id', async (req, res) => {
  try {
    await prisma.rubric.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting rubric:', error);
    res.status(500).json({ error: 'Failed to delete rubric' });
  }
});

export default router;
