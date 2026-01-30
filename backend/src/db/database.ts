import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../rubric.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
db.exec(`
  -- Rubrics table
  CREATE TABLE IF NOT EXISTS rubrics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    source_file TEXT,
    raw_content TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Criteria table
  CREATE TABLE IF NOT EXISTS criteria (
    id TEXT PRIMARY KEY,
    rubric_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    max_points INTEGER NOT NULL DEFAULT 10,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (rubric_id) REFERENCES rubrics(id) ON DELETE CASCADE
  );

  -- Assignments table
  CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rubric_id TEXT,
    due_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rubric_id) REFERENCES rubrics(id) ON DELETE SET NULL
  );

  -- Students table
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    student_id TEXT
  );

  -- Submissions table
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    assignment_id TEXT,
    student_id TEXT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    extracted_text TEXT,
    status TEXT DEFAULT 'pending',
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
  );

  -- Grades table
  CREATE TABLE IF NOT EXISTS grades (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    criterion_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    feedback TEXT,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (criterion_id) REFERENCES criteria(id) ON DELETE CASCADE
  );

  -- Overall feedback table
  CREATE TABLE IF NOT EXISTS overall_feedback (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL UNIQUE,
    total_score INTEGER NOT NULL,
    summary TEXT,
    FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
  );
`);

export default db;
