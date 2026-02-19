# FeedbackLab

AI-powered rubric-based feedback for student work. Teachers upload a rubric, students submit work, and Gemini AI generates detailed inline and criterion-by-criterion feedback. Students access their feedback via a shareable magic link and can ask the AI follow-up questions.

## Requirements

- Node.js v18+
- Gemini API key ([get one free](https://aistudio.google.com/app/apikey))

> **Note:** The free Gemini tier is limited to ~20 API calls/day, which covers roughly 10 student submissions (2 calls per submission).

## Setup

```bash
# 1. Install dependencies
cd frontend && npm install
cd ../backend && npm install

# 2. Configure environment
cd backend
cp .env.example .env
# Edit .env — set GEMINI_API_KEY and optionally DATABASE_URL

# 3. Initialize database
npx prisma db push
```

## Run

Open two terminals:

```bash
# Terminal 1 — Backend (port 3001)
cd backend && npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173

## Workflow

1. **Create a Rubric** — Define grading criteria manually, or upload a PDF/DOCX/image and let AI parse it. Also get feedback on rubric if desired
2. **Create an Assignment** — Name it and link it to a rubric
3. **Upload Submissions** — Add student work (PDF, DOCX, images, plain text, code files); text is extracted automatically
4. **Generate Feedback** — AI reads each submission against the rubric and produces:
   - 5–8 inline comments highlighting specific passages
   - Per-criterion feedback (strengths, areas for growth, suggestions)
   - An overall summary with priority improvements and next steps
5. **Review Feedback** — Optionally review AI output before releasing
6. **Release to Students** — Each student gets a unique magic link; no login required
7. **Student Portal** — Students view feedback in three tabs (Overall / By Criteria / Document), and can chat with the AI tutor about any comment

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Router |
| Backend | Node.js, Express 4, TypeScript |
| ORM | Prisma 6 |
| Database | SQLite (dev) / PostgreSQL (prod) |
| AI | Google Gemini 2.5 Flash Lite |
| File parsing | pdf-parse, mammoth, tesseract.js |
| Icons | Lucide React |
| Fonts | DM Sans, Source Serif 4 |

## Project Structure

```
RUBRIC/
├── frontend/          React SPA (port 5173)
│   └── src/
│       ├── pages/     Dashboard, Rubrics, Assignments, Students, StudentFeedback
│       ├── components/Layout, FeedbackViewer, ChatPanel, HighlightedDocument, ...
│       ├── services/  api.ts — typed client for all backend routes
│       └── types/     Shared TypeScript interfaces
│
├── backend/           Express API (port 3001)
│   └── src/
│       ├── routes/    rubrics.ts, assignments.ts, submissions.ts, students.ts
│       ├── services/  feedbackGeneration.ts, aiParsing.ts, textExtraction.ts
│       └── db/        prisma.ts (database client)
│   └── prisma/
│       └── schema.prisma   11 models: Rubric, Criterion, Assignment, Submission, ...
│
├── README.md
├── context.txt        LLM-oriented codebase guide
└── SKILL.md           Frontend UI/UX design principles
```

## Database Commands

```bash
# From backend/
npx prisma db push       # Apply schema changes
npx prisma generate      # Regenerate client after schema edits
npx prisma studio        # Browse data in browser UI
```

## Supported File Types

Student submissions and rubric uploads accept:
- Documents: `.pdf`, `.docx`, `.doc`
- Images: `.png`, `.jpg`, `.jpeg`, `.webp` (OCR via Tesseract)
- Code/text: `.txt`, `.py`, `.js`, `.ts`, `.java`, `.cpp`, `.c`, `.html`, `.css`, `.md`

Max file size: 50 MB per file, up to 100 files per upload.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `DATABASE_URL` | No | Defaults to `file:./dev.db` (SQLite) |
