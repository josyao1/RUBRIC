import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import rubricRoutes from './routes/rubrics.js';
import assignmentRoutes from './routes/assignments.js';
import submissionRoutes from './routes/submissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure uploads directories exist
const uploadsDir = join(__dirname, '../uploads');
const submissionsDir = join(__dirname, '../uploads/submissions');
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
if (!existsSync(submissionsDir)) mkdirSync(submissionsDir, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Routes
app.use('/api/rubrics', rubricRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║       FeedbackLab Backend Server          ║
  ╠═══════════════════════════════════════════╣
  ║  Local:   http://localhost:${PORT}           ║
  ║  Health:  http://localhost:${PORT}/api/health║
  ║  Database: Prisma (SQLite/PostgreSQL)     ║
  ║  Gemini API: ${hasGeminiKey ? 'Configured ✓' : 'NOT CONFIGURED ✗'}              ║
  ╚═══════════════════════════════════════════╝
  `);
  console.log('[SERVER] Ready to accept requests');
  console.log('[SERVER] Logging enabled - watch for [UPLOAD], [AI PARSE], [GEMINI] tags');
});
