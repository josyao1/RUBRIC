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
  rawContent?: string;
  createdAt: string;
  updatedAt: string;
}

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
}

export const submissionsApi = {
  // Get all submissions
  getAll: () => fetchApi<Submission[]>('/submissions'),

  // Get single submission
  getById: (id: string) => fetchApi<Submission>(`/submissions/${id}`),

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
// HEALTH CHECK
// ============================================================================

export const healthApi = {
  check: () => fetchApi<{ status: string; timestamp: string }>('/health'),
};
