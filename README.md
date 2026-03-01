# FeedbackLab

AI-powered rubric-based feedback for student work. Teachers create an assignment and share a join code. Students join via the code, upload their own work, and feedback auto-generates immediately — no manual release step required.

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
# Edit .env — set GEMINI_API_KEY

# 3. Initialize database
cd backend && npx prisma db push
```

## Run

Open two terminals:

```bash
# Terminal 1 — Backend (port 3001)
cd backend && npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173 — redirects to `/teacher`

## Workflow

### Teacher
1. **Create a Rubric** — Define grading criteria manually, or upload a PDF/DOCX/image for AI parsing
2. **Create an Assignment** — Link it to a rubric; a 6-character join code is auto-generated (e.g. `R7K3MX`)
3. **Share the code** — Students go to `/student` and enter the code
4. **Monitor** — The assignment detail view auto-populates as students join and submit

### Student
1. Go to `/student`, enter the join code
2. Pick your name from the list (or add yourself)
3. Upload your essay — feedback generates automatically (~30–60s)
4. View feedback in three tabs: Overall / By Criteria / Document with inline comments
5. Submit a revision to get comparative feedback

## Routes

| Path | Who | Description |
|---|---|---|
| `/teacher` | Teacher | Dashboard |
| `/teacher/rubrics` | Teacher | Rubric management |
| `/teacher/assignments` | Teacher | Assignment management + join codes |
| `/teacher/settings` | Teacher | Settings |
| `/student` | Student | Enter join code |
| `/student/:code` | Student | Identity picker |
| `/student/:code/:studentId` | Student | Workspace — upload, view feedback, resubmit |
| `/feedback/:token` | Student | Legacy magic-link access (still works) |

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
│       ├── pages/
│       │   ├── Dashboard.tsx         Teacher stats overview
│       │   ├── Rubrics.tsx           Rubric create/edit/AI parse
│       │   ├── Assignments.tsx       Assignment management + join codes
│       │   ├── Settings.tsx          Settings placeholder
│       │   ├── StudentPortal.tsx     Join code entry + identity picker
│       │   ├── StudentWorkspace.tsx  Student upload + feedback view
│       │   └── StudentFeedback.tsx   Legacy magic-link feedback page
│       ├── components/
│       │   ├── Layout.tsx            Teacher sidebar shell
│       │   ├── FeedbackViewer.tsx    3-tab feedback modal (teacher view)
│       │   ├── HighlightedDocument.tsx  Inline comment highlights
│       │   ├── ChatPanel.tsx         AI chat (magic-link flow)
│       │   ├── ResubmitPanel.tsx     Revision upload (magic-link flow)
│       │   ├── FeedbackCards.tsx     Per-criterion feedback cards
│       │   ├── FeedbackPDF.tsx       PDF export
│       │   └── RubricFeedbackTab.tsx Rubric quality feedback
│       └── services/api.ts           Typed API client
│
├── backend/           Express API (port 3001)
│   └── src/
│       ├── routes/
│       │   ├── rubrics.ts        CRUD + AI rubric parsing
│       │   ├── assignments.ts    CRUD + grading pipeline + join codes
│       │   ├── submissions.ts    File upload + text extraction
│       │   ├── students.ts       Student CRUD + magic-link endpoints + chat
│       │   └── join.ts           Student self-service endpoints (/api/join)
│       ├── services/
│       │   ├── feedbackGeneration.ts  Core AI grading logic
│       │   ├── aiParsing.ts           Rubric parsing from documents
│       │   └── textExtraction.ts      PDF/DOCX/image/text extraction
│       └── db/prisma.ts              Singleton Prisma client
│   └── prisma/schema.prisma          DB models
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

# Fresh rebuild (wipes data):
rm -f prisma/dev.db && npx prisma db push
```

## Supported File Types

- Documents: `.pdf`, `.docx`, `.doc`
- Images: `.png`, `.jpg`, `.jpeg`, `.webp` (OCR via Tesseract)
- Code/text: `.txt`, `.py`, `.js`, `.ts`, `.java`, `.cpp`, `.c`, `.html`, `.css`, `.md`

Max file size: 50 MB per file.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `DATABASE_URL` | No | Defaults to `file:./dev.db` (SQLite) |
