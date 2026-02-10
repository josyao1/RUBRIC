import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import prisma from '../db/prisma.js';
import { parseRubricWithAI, parseRubricWithVision } from '../services/aiParsing.js';

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
  console.log('[RUBRICS] GET / - Fetching all rubrics');
  try {
    const rubrics = await prisma.rubric.findMany({
      include: {
        criteria: {
          include: {
            levels: {
              orderBy: { sortOrder: 'asc' }
            }
          },
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
        order: c.sortOrder,
        levels: c.levels.map(l => ({
          id: l.id,
          label: l.label,
          description: l.description
        }))
      }))
    }));

    console.log(`[RUBRICS] GET / - Found ${transformed.length} rubrics`);
    res.json(transformed);
  } catch (error) {
    console.error('[RUBRICS] GET / - Error:', error);
    res.status(500).json({ error: 'Failed to fetch rubrics' });
  }
});

// Get single rubric
router.get('/:id', async (req, res) => {
  console.log(`[RUBRICS] GET /${req.params.id}`);
  try {
    const rubric = await prisma.rubric.findUnique({
      where: { id: req.params.id },
      include: {
        criteria: {
          include: {
            levels: {
              orderBy: { sortOrder: 'asc' }
            }
          },
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
        order: c.sortOrder,
        levels: c.levels.map(l => ({
          id: l.id,
          label: l.label,
          description: l.description
        }))
      }))
    });
  } catch (error) {
    console.error('Error fetching rubric:', error);
    res.status(500).json({ error: 'Failed to fetch rubric' });
  }
});

// Upload rubric file
router.post('/upload', upload.single('file'), async (req, res) => {
  console.log('[UPLOAD] POST /upload - Starting file upload');
  try {
    if (!req.file) {
      console.log('[UPLOAD] No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileName = req.file.originalname;
    const filePath = req.file.path;
    const ext = extname(fileName).toLowerCase();
    console.log(`[UPLOAD] File received: ${fileName} (${ext})`);
    console.log(`[UPLOAD] Saved to: ${filePath}`);

    // Extract text based on file type
    let rawContent = '';
    try {
      if (ext === '.txt') {
        console.log('[UPLOAD] Parsing TXT file...');
        rawContent = readFileSync(filePath, 'utf-8');
        console.log(`[UPLOAD] TXT parsed: ${rawContent.length} characters`);
      } else if (ext === '.pdf') {
        console.log('[UPLOAD] Parsing PDF file...');
        const pdfParse = require('pdf-parse');
        const pdfBuffer = readFileSync(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        rawContent = pdfData.text;
        console.log(`[UPLOAD] PDF text extraction: ${rawContent.trim().length} characters`);

        // If very little text extracted, it's likely a scanned PDF
        // Mark it for Gemini vision parsing instead
        if (rawContent.trim().length < 50) {
          console.log('[UPLOAD] PDF appears to be scanned/image-based');
          console.log('[UPLOAD] Will use Gemini Vision for parsing');
          rawContent = '__GEMINI_VISION__'; // Special marker
        }
      } else if (ext === '.docx' || ext === '.doc') {
        console.log('[UPLOAD] Parsing Word document...');
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        rawContent = result.value;
        console.log(`[UPLOAD] Word doc parsed: ${rawContent.length} characters`);
      } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        console.log('[UPLOAD] Image file detected - will use Gemini Vision for parsing');
        rawContent = '__GEMINI_VISION__'; // Gemini will read the image directly
      }
    } catch (parseError) {
      console.error('[UPLOAD] Error parsing file:', parseError);
      rawContent = '(Could not extract text from file)';
    }

    const rubricName = fileName.replace(/\.[^/.]+$/, '');
    console.log(`[UPLOAD] Creating rubric in database: "${rubricName}"`);

    const rubric = await prisma.rubric.create({
      data: {
        name: rubricName,
        description: 'Processing...',
        sourceFile: filePath,
        rawContent: rawContent
        // userId omitted until auth is implemented
      }
    });

    console.log(`[UPLOAD] Rubric created with ID: ${rubric.id}`);
    console.log('[UPLOAD] Starting automatic AI parsing...');

    // Auto-parse with AI
    try {
      const startTime = Date.now();
      let parsed;

      const isVisionNeeded = rawContent === '__GEMINI_VISION__' || rawContent.trim().length < 50;
      const isImageFile = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);

      if (isVisionNeeded || isImageFile) {
        console.log('[UPLOAD] Using Gemini Vision API...');
        parsed = await parseRubricWithVision(filePath);
      } else {
        console.log('[UPLOAD] Using Gemini text API...');
        parsed = await parseRubricWithAI(rawContent);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[UPLOAD] AI parsing complete in ${elapsed}ms`);
      console.log(`[UPLOAD] Extracted ${parsed.criteria.length} criteria`);

      // Save criteria with levels
      const updatedRubric = await prisma.rubric.update({
        where: { id: rubric.id },
        data: {
          description: 'AI-parsed rubric',
          criteria: {
            create: parsed.criteria.map((c, index) => ({
              name: c.name,
              description: c.description,
              sortOrder: index,
              levels: {
                create: c.levels.map((l, levelIndex) => ({
                  label: l.label,
                  description: l.description,
                  sortOrder: levelIndex
                }))
              }
            }))
          }
        },
        include: {
          criteria: {
            include: {
              levels: { orderBy: { sortOrder: 'asc' } }
            },
            orderBy: { sortOrder: 'asc' }
          }
        }
      });

      console.log('[UPLOAD] SUCCESS! Rubric saved with criteria and levels');

      res.json({
        ...updatedRubric,
        criteria: updatedRubric.criteria.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          order: c.sortOrder,
          levels: c.levels.map(l => ({
            id: l.id,
            label: l.label,
            description: l.description
          }))
        }))
      });
    } catch (parseError: any) {
      console.error('[UPLOAD] AI parsing failed:', parseError.message);
      // Return rubric without criteria if parsing failed
      res.json({
        ...rubric,
        description: 'Upload complete - AI parsing failed: ' + parseError.message,
        criteria: []
      });
    }
  } catch (error) {
    console.error('[UPLOAD] Error:', error);
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
            sortOrder: index,
            levels: c.levels ? {
              create: c.levels.map((l: any, levelIndex: number) => ({
                label: l.label || '',
                description: l.description || '',
                sortOrder: levelIndex
              }))
            } : undefined
          }))
        }
      },
      include: {
        criteria: {
          include: { levels: { orderBy: { sortOrder: 'asc' } } },
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
        order: c.sortOrder,
        levels: c.levels.map(l => ({
          id: l.id,
          label: l.label,
          description: l.description
        }))
      }))
    });
  } catch (error) {
    console.error('Error creating rubric:', error);
    res.status(500).json({ error: 'Failed to create rubric' });
  }
});

// Update rubric
router.put('/:id', async (req, res) => {
  console.log(`[RUBRICS] PUT /${req.params.id} - Updating rubric`);
  try {
    const { name, description, criteria } = req.body;
    const { id } = req.params;

    // Delete existing criteria (levels cascade delete)
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
            sortOrder: index,
            levels: c.levels ? {
              create: c.levels.map((l: any, levelIndex: number) => ({
                label: l.label || '',
                description: l.description || '',
                sortOrder: levelIndex
              }))
            } : undefined
          }))
        }
      },
      include: {
        criteria: {
          include: { levels: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    console.log(`[RUBRICS] Updated rubric with ${rubric.criteria.length} criteria`);

    res.json({
      ...rubric,
      criteria: rubric.criteria.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        order: c.sortOrder,
        levels: c.levels.map(l => ({
          id: l.id,
          label: l.label,
          description: l.description
        }))
      }))
    });
  } catch (error) {
    console.error('Error updating rubric:', error);
    res.status(500).json({ error: 'Failed to update rubric' });
  }
});

// Parse rubric with AI
router.post('/:id/parse', async (req, res) => {
  console.log(`[AI PARSE] POST /${req.params.id}/parse - Starting AI parsing`);
  try {
    const rubric = await prisma.rubric.findUnique({
      where: { id: req.params.id }
    });

    if (!rubric) {
      console.log('[AI PARSE] Rubric not found');
      return res.status(404).json({ error: 'Rubric not found' });
    }

    if (!rubric.rawContent) {
      console.log('[AI PARSE] No raw content to parse');
      return res.status(400).json({ error: 'No text content to parse. Upload a file first.' });
    }

    console.log(`[AI PARSE] Found rubric "${rubric.name}" with ${rubric.rawContent.length} chars`);

    // Parse with AI - use Vision API for scanned PDFs/images
    const startTime = Date.now();
    let parsed;

    const isVisionNeeded = rubric.rawContent === '__GEMINI_VISION__' || rubric.rawContent.trim().length < 50;
    const fileExt = rubric.sourceFile?.split('.').pop()?.toLowerCase();
    const isImageFile = ['png', 'jpg', 'jpeg', 'webp'].includes(fileExt || '');

    if ((isVisionNeeded || isImageFile) && rubric.sourceFile) {
      console.log('[AI PARSE] Using Gemini Vision API for image/scanned PDF...');
      parsed = await parseRubricWithVision(rubric.sourceFile);
    } else {
      console.log('[AI PARSE] Using Gemini text API...');
      parsed = await parseRubricWithAI(rubric.rawContent);
    }

    const elapsed = Date.now() - startTime;

    console.log(`[AI PARSE] Gemini responded in ${elapsed}ms`);
    console.log(`[AI PARSE] Extracted ${parsed.criteria.length} criteria`);

    // Delete existing criteria (levels cascade delete)
    await prisma.criterion.deleteMany({
      where: { rubricId: rubric.id }
    });

    const updatedRubric = await prisma.rubric.update({
      where: { id: rubric.id },
      data: {
        description: 'AI-parsed rubric',
        criteria: {
          create: parsed.criteria.map((c, index) => ({
            name: c.name,
            description: c.description,
            sortOrder: index,
            levels: {
              create: c.levels.map((l, levelIndex) => ({
                label: l.label,
                description: l.description,
                sortOrder: levelIndex
              }))
            }
          }))
        }
      },
      include: {
        criteria: {
          include: {
            levels: { orderBy: { sortOrder: 'asc' } }
          },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    console.log('[AI PARSE] SUCCESS! Rubric updated with AI-parsed criteria:');
    updatedRubric.criteria.forEach(c => {
      console.log(`  - ${c.name}: ${c.levels.length} levels`);
    });

    res.json({
      ...updatedRubric,
      criteria: updatedRubric.criteria.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        order: c.sortOrder,
        levels: c.levels.map(l => ({
          id: l.id,
          label: l.label,
          description: l.description
        }))
      }))
    });
  } catch (error: any) {
    console.error('[AI PARSE] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to parse rubric' });
  }
});

// Get rubric source file for preview
router.get('/:id/file', async (req, res) => {
  try {
    const rubric = await prisma.rubric.findUnique({
      where: { id: req.params.id },
      select: { sourceFile: true }
    });

    if (!rubric || !rubric.sourceFile) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(rubric.sourceFile);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Get AI feedback on rubric quality
router.post('/:id/feedback', async (req, res) => {
  console.log(`[RUBRIC FEEDBACK] POST /${req.params.id}/feedback - Generating feedback`);
  try {
    const rubric = await prisma.rubric.findUnique({
      where: { id: req.params.id },
      include: {
        criteria: {
          include: {
            levels: { orderBy: { sortOrder: 'asc' } }
          },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!rubric) {
      return res.status(404).json({ error: 'Rubric not found' });
    }

    if (!rubric.criteria || rubric.criteria.length === 0) {
      return res.status(400).json({ error: 'Rubric has no criteria to analyze' });
    }

    // Build rubric text representation for the AI
    let rubricText = `Rubric: ${rubric.name}\n`;
    if (rubric.description) rubricText += `Description: ${rubric.description}\n`;
    rubricText += '\nCriteria:\n';

    for (const criterion of rubric.criteria) {
      rubricText += `\n## ${criterion.name}\n`;
      if (criterion.description) rubricText += `Description: ${criterion.description}\n`;

      if (criterion.levels && criterion.levels.length > 0) {
        rubricText += 'Performance Levels:\n';
        for (const level of criterion.levels) {
          rubricText += `  - ${level.label}: ${level.description}\n`;
        }
      }
    }

    console.log(`[RUBRIC FEEDBACK] Analyzing rubric with ${rubric.criteria.length} criteria`);

    // Import Gemini
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

    // TODO: Replace this placeholder prompt with the optimized prompt from research
    const systemPrompt = `You are an expert in educational assessment and rubric design.
        Analyze the following rubric and provide constructive feedback to help the teacher improve it.

        PLACEHOLDER: This prompt will be replaced with an optimized prompt based on rubric research.

        For now, provide feedback on:
        1. Clarity of criteria
        2. Specificity of performance level descriptions
        3. Alignment between criteria and levels
        4. Suggestions for improvement

        Be constructive and specific in your feedback.`;

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: rubricText }] }],
      config: {
        systemInstruction: systemPrompt
      }
    });

    const feedbackText = response.text || 'Unable to generate feedback. Please try again.';

    console.log(`[RUBRIC FEEDBACK] Generated ${feedbackText.length} chars of feedback`);

    res.json({
      rubricId: rubric.id,
      rubricName: rubric.name,
      feedback: feedbackText,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[RUBRIC FEEDBACK] Error:', error);

    if (error?.status === 429) {
      return res.status(429).json({ error: 'AI rate limit reached. Please try again in a moment.' });
    }

    res.status(500).json({ error: error.message || 'Failed to generate rubric feedback' });
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
