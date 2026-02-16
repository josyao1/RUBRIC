/**
 * api — API client with typed methods for all backend endpoints
 *
 * Provides namespaced API objects (rubricsApi, assignmentsApi, studentsApi)
 * with methods for CRUD operations, file uploads, grading, and feedback.
 * All methods include error handling via a generic fetchApi wrapper.
 */
const API_BASE = 'http://localhost:3001/api';

// Generic fetch wrapper with error handling
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      // TODO: Add auth header when implemented
      // 'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// File upload wrapper (multipart/form-data)
async function uploadFile<T>(
  endpoint: string,
  file: File,
  additionalData?: Record<string, string>
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const formData = new FormData();
  formData.append('file', file);

  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    // TODO: Add auth header when implemented
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

// ============================================================================
// RUBRICS API
// ============================================================================

export interface CriterionLevel {
  id?: string;
  label: string;      // e.g., "Excellent", "Good", "Developing", "Beginning"
  description: string;
}

export interface Criterion {
  id?: string;
  name: string;
  description: string;
  order?: number;
  levels?: CriterionLevel[];
}

export interface Rubric {
  id: string;
  name: string;
  description: string;
  criteria: Criterion[];
  sourceFile?: string;
  rawContent?: string;
  createdAt: string;
  updatedAt: string;
}

export const getFileUrl = (rubricId: string) => `${API_BASE}/rubrics/${rubricId}/file`;

export interface CreateRubricData {
  name: string;
  description?: string;
  criteria: Omit<Criterion, 'id'>[];
  userId?: string; // Optional now, required with auth
}

export const rubricsApi = {
  // Get all rubrics (will be filtered by user when auth is added)
  getAll: () => fetchApi<Rubric[]>('/rubrics'),

  // Get single rubric
  getById: (id: string) => fetchApi<Rubric>(`/rubrics/${id}`),

  // Create rubric manually
  create: (data: CreateRubricData) =>
    fetchApi<Rubric>('/rubrics', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Upload rubric file
  upload: (file: File, userId?: string) =>
    uploadFile<Rubric>('/rubrics/upload', file, userId ? { userId } : undefined),

  // Update rubric
  update: (id: string, data: Partial<CreateRubricData>) =>
    fetchApi<Rubric>(`/rubrics/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Delete rubric
  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/rubrics/${id}`, {
      method: 'DELETE',
    }),

  // Parse rubric with AI
  parse: (id: string) =>
    fetchApi<Rubric>(`/rubrics/${id}/parse`, {
      method: 'POST',
    }),

  // Get existing AI feedback on rubric (most recent)
  getExistingFeedback: (id: string) =>
    fetchApi<{
      id: string;
      rubricId: string;
      feedback: string;
      generatedAt: string;
    }>(`/rubrics/${id}/feedback`),

  // Generate new AI feedback on rubric quality
  generateFeedback: (id: string) =>
    fetchApi<{
      id: string;
      rubricId: string;
      rubricName: string;
      feedback: string;
      generatedAt: string;
    }>(`/rubrics/${id}/feedback`, {
      method: 'POST',
    }),

  // Get feedback history for a rubric
  getFeedbackHistory: (id: string) =>
    fetchApi<Array<{
      id: string;
      rubricId: string;
      feedback: string;
      generatedAt: string;
    }>>(`/rubrics/${id}/feedback/history`),
};

// ============================================================================
// ASSIGNMENTS API
// ============================================================================

export interface Assignment {
  id: string;
  name: string;
  dueDate?: string;
  createdAt: string;
  rubricId?: string;
  rubricName?: string;
  submissionCount: number;
  gradingStatus: 'idle' | 'in_progress' | 'completed' | 'error';
  gradingProgress: number;
  gradingTotal: number;
}

export interface AssignmentSubmission {
  id: string;
  fileName: string;
  status: 'pending' | 'processing' | 'ready' | 'reviewed';
  submittedAt: string;
  studentId?: string;
  studentName?: string;
  studentEmail?: string;
  feedbackReleased?: boolean;
  feedbackViewedAt?: string;
  feedbackToken?: string;
  parentSubmissionId?: string | null;
}

export interface AssignmentDetail extends Assignment {
  submissions: AssignmentSubmission[];
  rubric?: {
    id: string;
    name: string;
    criteria: Array<{
      id: string;
      name: string;
      description?: string;
    }>;
  };
}

export interface CreateAssignmentData {
  name: string;
  rubricId?: string;
  dueDate?: string;
}

export interface GradingStatus {
  gradingStatus: 'idle' | 'in_progress' | 'completed' | 'error';
  gradingProgress: number;
  gradingTotal: number;
}

export const assignmentsApi = {
  getAll: () => fetchApi<Assignment[]>('/assignments'),

  getById: (id: string) => fetchApi<AssignmentDetail>(`/assignments/${id}`),

  create: (data: CreateAssignmentData) =>
    fetchApi<Assignment>('/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateAssignmentData>) =>
    fetchApi<Assignment>(`/assignments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/assignments/${id}`, {
      method: 'DELETE',
    }),

  startGrading: (id: string, teacherPreferences?: string) =>
    fetchApi<{ success: boolean; message: string; totalSubmissions: number }>(
      `/assignments/${id}/start-grading`,
      {
        method: 'POST',
        body: JSON.stringify({ teacherPreferences }),
      }
    ),

  getGradingStatus: (id: string) =>
    fetchApi<GradingStatus>(`/assignments/${id}/grading-status`),

  regradeSelected: (id: string, submissionIds: string[], teacherPreferences?: string) =>
    fetchApi<{ success: boolean; message: string; totalSubmissions: number }>(
      `/assignments/${id}/regrade-selected`,
      {
        method: 'POST',
        body: JSON.stringify({ submissionIds, teacherPreferences }),
      }
    ),

  uploadSubmissions: async (assignmentId: string, files: File[]) => {
    const url = `${API_BASE}/submissions/upload`;
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('assignmentId', assignmentId);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  },
};

// ============================================================================
// SUBMISSIONS API
// ============================================================================

export interface Submission {
  id: string;
  assignmentId?: string;
  studentId?: string;
  studentName?: string;
  fileName: string;
  extractedText?: string;
  status: 'pending' | 'processing' | 'ready' | 'reviewed';
  submittedAt: string;
  feedbackToken?: string;
  feedbackReleased?: boolean;
  feedbackViewedAt?: string;
  assignment?: { id: string; name: string };
}

export interface InlineComment {
  id: string;
  startPosition: number;
  endPosition: number;
  highlightedText: string;
  comment: string;
  criterion?: {
    id: string;
    name: string;
  };
}

export interface SectionFeedback {
  id: string;
  strengths: string; // JSON string array
  areasForGrowth: string; // JSON string array
  suggestions: string; // JSON string array
  criterion: {
    id: string;
    name: string;
  };
}

export interface OverallFeedback {
  id: string;
  summary: string;
  priorityImprovements: string; // JSON string array
  encouragement?: string;
  nextSteps: string; // JSON string array
}

export interface SubmissionWithFeedback extends Submission {
  inlineComments: InlineComment[];
  sectionFeedback: SectionFeedback[];
  overallFeedback?: OverallFeedback;
}

export const submissionsApi = {
  // Get all submissions
  getAll: () => fetchApi<Submission[]>('/submissions'),

  // Get single submission with feedback
  getById: (id: string) => fetchApi<SubmissionWithFeedback>(`/submissions/${id}`),

  // Upload submissions (multiple files)
  upload: async (files: File[], assignmentId?: string) => {
    const url = `${API_BASE}/submissions/upload`;
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('files', file);
    });

    if (assignmentId) {
      formData.append('assignmentId', assignmentId);
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  },

  // Update submission status
  updateStatus: (id: string, status: string) =>
    fetchApi<{ success: boolean }>(`/submissions/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Delete submission
  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/submissions/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================================================
// STUDENTS API
// ============================================================================

export interface Student {
  id: string;
  name: string;
  email?: string;
  studentId?: string;
  createdAt: string;
  submissions?: Submission[];
}

export interface ReleasedFeedback {
  submissionId: string;
  studentName: string;
  studentEmail?: string;
  feedbackUrl: string;
  token: string;
}

export const studentsApi = {
  getAll: () => fetchApi<Student[]>('/students'),

  create: (data: { name: string; email?: string; studentId?: string }) =>
    fetchApi<Student>('/students', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  import: (students: { name: string; email: string; studentId?: string }[]) =>
    fetchApi<{ created: Student[]; skipped: any[] }>('/students/import', {
      method: 'POST',
      body: JSON.stringify({ students }),
    }),

  update: (id: string, data: { name?: string; email?: string; studentId?: string }) =>
    fetchApi<Student>(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<{ success: boolean }>(`/students/${id}`, {
      method: 'DELETE',
    }),

  linkSubmission: (submissionId: string, studentId: string) =>
    fetchApi<Submission>('/students/link-submission', {
      method: 'POST',
      body: JSON.stringify({ submissionId, studentId }),
    }),

  releaseFeedback: (assignmentId: string, sendEmail: boolean = false) =>
    fetchApi<{ released: ReleasedFeedback[]; errors: any[] }>('/students/release-feedback', {
      method: 'POST',
      body: JSON.stringify({ assignmentId, sendEmail }),
    }),

  getFeedback: (token: string) =>
    fetchApi<SubmissionWithFeedback & { studentName?: string; assignmentName?: string }>(
      `/students/feedback/${token}`
    ),

  chatAboutFeedback: (token: string, message: string, history: { role: string; content: string }[]) =>
    fetchApi<{ response: string }>(`/students/feedback/${token}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  resubmit: async (token: string, file: File) => {
    const url = `${API_BASE}/students/feedback/${token}/resubmit`;
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }

    return response.json();
  },
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

export const healthApi = {
  check: () => fetchApi<{ status: string; timestamp: string }>('/health'),
};
