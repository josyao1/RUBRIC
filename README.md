# RUBRIC

AI-Powered Grading Assistant for Educators

## Prerequisites

- **Node.js** v18 or higher ([download](https://nodejs.org/))
- **npm** (comes with Node.js)

To verify installation:
```bash
node --version   # Should show v18.x.x or higher
npm --version    # Should show 9.x.x or higher
```

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd RUBRIC
```

### 2. Install Dependencies

Install both frontend and backend dependencies:

```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

### 3. Run the Application

You need **two terminal windows** running simultaneously:

**Terminal 1 - Backend API (port 3001):**
```bash
cd backend
npm run dev
```

You should see:
```
╔═══════════════════════════════════════════╗
║         RUBRIC Backend Server             ║
╠═══════════════════════════════════════════╣
║  Local:   http://localhost:3001           ║
╚═══════════════════════════════════════════╝
```

**Terminal 2 - Frontend UI (port 5173):**
```bash
cd frontend
npm run dev
```

You should see:
```
VITE v6.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

### 4. Open the App

Visit **http://localhost:5173** in your browser.

## Project Structure

```
RUBRIC/
├── frontend/                 # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   │   └── Layout.tsx    # Main layout with sidebar
│   │   ├── pages/            # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Rubrics.tsx   # Upload/create rubrics
│   │   │   ├── Submissions.tsx
│   │   │   ├── Assignments.tsx
│   │   │   ├── GradeCenter.tsx
│   │   │   └── Settings.tsx
│   │   └── types/            # TypeScript types
│   └── package.json
│
├── backend/                  # Express + SQLite
│   ├── src/
│   │   ├── db/
│   │   │   └── database.ts   # SQLite setup & schema
│   │   ├── routes/
│   │   │   ├── rubrics.ts    # Rubric CRUD + file upload
│   │   │   └── submissions.ts
│   │   └── index.ts          # Express server entry
│   ├── uploads/              # Uploaded files stored here
│   └── package.json
│
├── plan.txt                  # Project roadmap
└── README.md
```

## Features

### Currently Working
- [x] Professional dashboard UI with sidebar navigation
- [x] Rubric upload (PDF, DOCX, TXT, CSV, Excel)
- [x] Manual rubric builder with dynamic criteria
- [x] Student submission upload (single or bulk)
- [x] Automatic text extraction from uploaded files
- [x] SQLite database for local storage
- [x] Auto-detection of student names from filenames

### Coming Soon (Needs API Tokens)
- [ ] AI-powered rubric parsing (extract criteria automatically)
- [ ] AI grading with per-criterion feedback
- [ ] Grade review and approval workflow
- [ ] Export grades to CSV/Excel

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rubrics` | List all rubrics |
| POST | `/api/rubrics` | Create rubric manually |
| POST | `/api/rubrics/upload` | Upload rubric file |
| GET | `/api/rubrics/:id` | Get single rubric |
| PUT | `/api/rubrics/:id` | Update rubric |
| DELETE | `/api/rubrics/:id` | Delete rubric |
| GET | `/api/submissions` | List all submissions |
| POST | `/api/submissions/upload` | Upload student work |
| GET | `/api/health` | Health check |

## Troubleshooting

### "Module not found" errors
```bash
# Re-install dependencies
cd frontend && rm -rf node_modules && npm install
cd ../backend && rm -rf node_modules && npm install
```

### Port already in use
```bash
# Kill process on port 3001 (backend)
lsof -ti:3001 | xargs kill -9

# Kill process on port 5173 (frontend)
lsof -ti:5173 | xargs kill -9
```

### Database issues
The SQLite database is created automatically at `backend/rubric.db`. To reset:
```bash
rm backend/rubric.db
# Restart backend - database will be recreated
```

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router, Lucide Icons
- **Backend:** Node.js, Express, TypeScript, better-sqlite3
- **File Parsing:** pdf-parse, mammoth (DOCX)
