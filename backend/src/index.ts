import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import rubricRoutes from './routes/rubrics.js';
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

// Routes
app.use('/api/rubrics', rubricRoutes);
app.use('/api/submissions', submissionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║       GradeMate Backend Server            ║
  ╠═══════════════════════════════════════════╣
  ║  Local:   http://localhost:${PORT}           ║
  ║  Health:  http://localhost:${PORT}/api/health║
  ║  Database: Prisma (SQLite/PostgreSQL)     ║
  ╚═══════════════════════════════════════════╝
  `);
});
