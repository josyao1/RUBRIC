# FeedbackLab

AI-powered rubric-based feedback for student work.

## Requirements

- Node.js v18+ ([download](https://nodejs.org/))
- Gemini API key ([get one free](https://aistudio.google.com/app/apikey))

## Setup

```bash
# 1. Install dependencies
cd frontend && npm install
cd ../backend && npm install

# 2. Configure environment
cd backend
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 3. Initialize database
npx prisma db push
```

## Run

Open two terminals:

```bash
# Terminal 1 - Backend (port 3001)
cd backend && npm run dev

# Terminal 2 - Frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173

## Quick Start

1. **Create a Rubric** - Define grading criteria
2. **Create an Assignment** - Link it to your rubric
3. **Upload Submissions** - Add student work (PDF, DOCX, images, text)
4. **Generate Feedback** - AI grades based on your rubric
5. **Release to Students** - Share via magic links

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Express, Prisma, SQLite
- AI: Google Gemini API
