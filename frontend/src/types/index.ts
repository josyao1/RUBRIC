/**
 * types — Shared TypeScript type definitions
 *
 * Exports interfaces and types used across the frontend: Criterion, Rubric,
 * Assignment, Submission, Student, and related domain models.
 */
export interface Criterion {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
  order: number;
}

export interface Rubric {
  id: string;
  name: string;
  description: string;
  criteria: Criterion[];
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  studentId?: string;
}

export interface Submission {
  id: string;
  studentId: string;
  assignmentId: string;
  fileName: string;
  status: 'pending' | 'grading' | 'graded' | 'reviewed';
  submittedAt: string;
}

export interface Grade {
  id: string;
  submissionId: string;
  criterionId: string;
  score: number;
  feedback: string;
}

export interface Assignment {
  id: string;
  name: string;
  rubricId: string;
  dueDate?: string;
  createdAt: string;
}
