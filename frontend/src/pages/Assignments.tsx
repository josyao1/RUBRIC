/**
 * Assignments — Assignments management page with grading controls
 *
 * Lists assignments in a card grid. Provides modals for creating assignments,
 * viewing submissions, uploading student work, triggering AI grading, and
 * reviewing per-submission feedback. Includes bulk and individual grading actions.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Plus, BookOpen, Calendar, FileText, Trash2, Loader2, AlertCircle,
  Play, CheckCircle, XCircle, X, User, Clock, Eye, Edit3, Save,
  Upload, Send, UserPlus, RefreshCw, Copy, ExternalLink
} from 'lucide-react';
import {
  assignmentsApi, rubricsApi, studentsApi, submissionsApi,
  type Assignment, type AssignmentDetail, type Rubric, type Student
} from '../services/api';
import FeedbackViewer from '../components/FeedbackViewer';
import UploadTab from '../components/UploadTab';

export default function Assignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [gradingAssignment, setGradingAssignment] = useState<Assignment | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const pollingRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    loadAssignments();
    return () => {
      // Cleanup polling intervals on unmount
      Object.values(pollingRef.current).forEach(clearInterval);
    };
  }, []);

  // Start polling for assignments that are in_progress
  useEffect(() => {
    assignments.forEach(a => {
      if (a.gradingStatus === 'in_progress' && !pollingRef.current[a.id]) {
        // Start polling
        pollingRef.current[a.id] = setInterval(async () => {
          try {
            const status = await assignmentsApi.getGradingStatus(a.id);
            setAssignments(prev => prev.map(assignment =>
              assignment.id === a.id
                ? { ...assignment, ...status }
                : assignment
            ));
            // Stop polling if completed or error
            if (status.gradingStatus !== 'in_progress') {
              clearInterval(pollingRef.current[a.id]);
              delete pollingRef.current[a.id];
            }
          } catch (err) {
            console.error('Failed to poll grading status:', err);
          }
        }, 3000);
      } else if (a.gradingStatus !== 'in_progress' && pollingRef.current[a.id]) {
        // Stop polling if status changed
        clearInterval(pollingRef.current[a.id]);
        delete pollingRef.current[a.id];
      }
    });
  }, [assignments]);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await assignmentsApi.getAll();
      setAssignments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;
    try {
      await assignmentsApi.delete(id);
      setAssignments(assignments.filter(a => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assignment');
    }
  };

  const handleStartGrading = async (assignmentId: string, teacherPreferences: string) => {
    try {
      await assignmentsApi.startGrading(assignmentId, teacherPreferences);
      // Update local state to show in_progress
      setAssignments(prev => prev.map(a =>
        a.id === assignmentId
          ? { ...a, gradingStatus: 'in_progress' as const, gradingProgress: 0 }
          : a
      ));
      setGradingAssignment(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start grading');
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
          <p className="text-gray-600 mt-1">Create assignments and link them to rubrics for feedback</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Assignment
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateAssignmentModal
          onClose={() => setShowCreate(false)}
          onCreate={(assignment) => {
            setAssignments([assignment, ...assignments]);
            setShowCreate(false);
          }}
        />
      )}

      {/* Start Grading Modal */}
      {gradingAssignment && (
        <StartGradingModal
          assignment={gradingAssignment}
          onClose={() => setGradingAssignment(null)}
          onStart={(prefs) => handleStartGrading(gradingAssignment.id, prefs)}
        />
      )}

      {/* Assignment Detail Modal */}
      {selectedAssignmentId && (
        <AssignmentDetailModal
          assignmentId={selectedAssignmentId}
          onClose={() => setSelectedAssignmentId(null)}
          onUpdate={(updated) => {
            setAssignments(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
          }}
          onStartGrading={(assignment) => {
            setSelectedAssignmentId(null);
            setGradingAssignment(assignment);
          }}
        />
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
          <span className="ml-3 text-gray-600">Loading assignments...</span>
        </div>
      )}

      {/* Assignments List */}
      {!loading && assignments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments yet</h3>
          <p className="text-gray-500 mb-6">Create an assignment and link it to a rubric for feedback.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Assignment
          </button>
        </div>
      ) : !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedAssignmentId(assignment.id)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-forest-100 rounded-lg">
                  <BookOpen className="w-5 h-5 text-forest-600" />
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(assignment.id); }}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{assignment.name}</h3>
              {assignment.rubricName ? (
                <div className="flex items-center text-sm text-green-600 mb-2">
                  <FileText className="w-4 h-4 mr-1" />
                  {assignment.rubricName}
                </div>
              ) : (
                <div className="flex items-center text-sm text-yellow-600 mb-2">
                  <FileText className="w-4 h-4 mr-1" />
                  No rubric linked
                </div>
              )}
              {assignment.dueDate && (
                <div className="flex items-center text-sm text-gray-500 mb-3">
                  <Calendar className="w-4 h-4 mr-1" />
                  Due: {new Date(assignment.dueDate).toLocaleDateString()}
                </div>
              )}

              {/* Grading Status */}
              {assignment.gradingStatus === 'in_progress' && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-blue-600 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Generating feedback...
                    </span>
                    <span className="text-gray-500">
                      {assignment.gradingProgress}/{assignment.gradingTotal}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{
                        width: `${assignment.gradingTotal > 0
                          ? (assignment.gradingProgress / assignment.gradingTotal) * 100
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {assignment.gradingStatus === 'completed' && assignment.gradingTotal > 0 && (
                <div className="flex items-center text-sm text-green-600 mb-3">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Feedback ready for {assignment.gradingTotal} submission{assignment.gradingTotal !== 1 ? 's' : ''}
                </div>
              )}

              {assignment.gradingStatus === 'error' && (
                <div className="flex items-center text-sm text-red-600 mb-3">
                  <XCircle className="w-4 h-4 mr-1" />
                  Feedback error - try again
                </div>
              )}

              <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                <span className="text-gray-500">
                  {assignment.submissionCount} submission{assignment.submissionCount !== 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2">
                  {assignment.rubricName &&
                   assignment.submissionCount > 0 &&
                   assignment.gradingStatus !== 'in_progress' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setGradingAssignment(assignment); }}
                      className="flex items-center text-forest-600 hover:text-forest-700 font-medium"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      {assignment.gradingStatus === 'completed' ? 'Regenerate' : 'Generate Feedback'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateAssignmentModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (assignment: Assignment) => void;
}) {
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [rubricId, setRubricId] = useState('');
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loadingRubrics, setLoadingRubrics] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRubrics = async () => {
      try {
        const data = await rubricsApi.getAll();
        setRubrics(data);
      } catch (err) {
        console.error('Failed to load rubrics:', err);
      } finally {
        setLoadingRubrics(false);
      }
    };
    loadRubrics();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const assignment = await assignmentsApi.create({
        name,
        rubricId: rubricId || undefined,
        dueDate: dueDate || undefined
      });
      onCreate(assignment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create Assignment</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Midterm Essay"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rubric</label>
            {loadingRubrics ? (
              <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading rubrics...
              </div>
            ) : (
              <select
                value={rubricId}
                onChange={(e) => setRubricId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500"
              >
                <option value="">Select a rubric (optional)</option>
                {rubrics.length === 0 ? (
                  <option disabled>No rubrics available - create one first</option>
                ) : (
                  rubrics.map(rubric => (
                    <option key={rubric.id} value={rubric.id}>
                      {rubric.name} ({rubric.criteria?.length || 0} criteria)
                    </option>
                  ))
                )}
              </select>
            )}
            {rubrics.length === 0 && !loadingRubrics && (
              <p className="text-sm text-gray-500 mt-1">
                You can add a rubric later after creating one.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date (Optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StartGradingModal({ assignment, onClose, onStart }: {
  assignment: Assignment;
  onClose: () => void;
  onStart: (teacherPreferences: string) => void;
}) {
  const [preferences, setPreferences] = useState('');
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    await onStart(preferences);
    setStarting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-forest-100 rounded-lg">
            <Play className="w-5 h-5 text-forest-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Start Generating Feedback</h2>
            <p className="text-sm text-gray-500">{assignment.name}</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-600">Rubric:</span>
            <span className="font-medium text-gray-900">{assignment.rubricName}</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assignment Context & Instructions (Optional)
          </label>
          <textarea
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            placeholder={"Describe the assignment topic and any feedback preferences. This helps the AI understand context when the rubric alone isn't specific enough.\n\nExamples:\n• This is a Year 9 essay on the causes of World War I\n• Students are analysing the impact of imperialism on colonised nations\n• This is a first draft — be encouraging but honest\n• Pay close attention to use of historical evidence"}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 h-32 text-sm resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            Topic context and instructions are passed directly to the AI when generating feedback for each submission.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Feedback generation takes a few seconds per submission to ensure quality.
            You can leave this page and come back - progress will be saved.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50"
          >
            {starting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start Generating Feedback
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper component to group submissions by student
function SubmissionsGroupedByStudent({
  submissions,
  students,
  selectedIds,
  copiedToken,
  toggleSelect,
  toggleSelectAll,
  handleLinkStudent,
  handleDeleteSubmission,
  copyMagicLink,
  setViewingSubmissionId,
  getStatusIcon,
  getStatusLabel,
}: {
  submissions: import('../services/api').AssignmentSubmission[];
  students: Student[];
  selectedIds: Set<string>;
  copiedToken: string | null;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  handleLinkStudent: (submissionId: string, studentId: string) => void;
  handleDeleteSubmission: (id: string) => void;
  copyMagicLink: (token: string) => void;
  setViewingSubmissionId: (id: string) => void;
  getStatusIcon: (status: string) => React.ReactNode;
  getStatusLabel: (status: string) => string;
}) {
  // Group submissions by student
  // Build a map: studentId (or 'unassigned') -> submissions with version numbers

  // First, identify root submissions (no parent) and their revision chains
  const rootSubmissions = submissions.filter(s => !s.parentSubmissionId);
  const revisionMap = new Map<string, typeof submissions>(); // parentId -> revisions

  for (const sub of submissions) {
    if (sub.parentSubmissionId) {
      const revisions = revisionMap.get(sub.parentSubmissionId) || [];
      revisions.push(sub);
      revisionMap.set(sub.parentSubmissionId, revisions);
    }
  }

  // Build revision chains (recursive)
  function getVersionChain(rootId: string): typeof submissions {
    const chain: typeof submissions = [];
    const directRevisions = revisionMap.get(rootId) || [];
    // Sort revisions by submittedAt
    directRevisions.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
    for (const rev of directRevisions) {
      chain.push(rev);
      chain.push(...getVersionChain(rev.id));
    }
    return chain;
  }

  // Group by student
  interface StudentGroup {
    studentId: string | null;
    studentName: string | null;
    submissions: Array<typeof submissions[0] & { version: number }>;
  }

  const groupsMap = new Map<string, StudentGroup>();

  for (const root of rootSubmissions) {
    const key = root.studentId || 'unassigned';
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        studentId: root.studentId || null,
        studentName: root.studentName || null,
        submissions: []
      });
    }
    const group = groupsMap.get(key)!;

    // Add root as v1
    group.submissions.push({ ...root, version: 1 });

    // Add revisions as v2, v3, etc.
    const revisions = getVersionChain(root.id);
    revisions.forEach((rev, idx) => {
      group.submissions.push({ ...rev, version: idx + 2 });
    });
  }

  // Convert to array, sort: assigned students first (alphabetically), then unassigned
  const groups = Array.from(groupsMap.values()).sort((a, b) => {
    if (!a.studentId && b.studentId) return 1;
    if (a.studentId && !b.studentId) return -1;
    return (a.studentName || '').localeCompare(b.studentName || '');
  });

  // Helper to render a single submission row
  const renderSubmissionRow = (
    sub: typeof submissions[0] & { version: number },
    isRevision: boolean
  ) => (
    <div
      key={sub.id}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors ${
        selectedIds.has(sub.id) ? 'bg-forest-50/50' : ''
      } ${isRevision ? 'ml-6 border-l-2 border-gray-200' : ''}`}
    >
      <input
        type="checkbox"
        checked={selectedIds.has(sub.id)}
        onChange={() => toggleSelect(sub.id)}
        className="rounded border-gray-300 text-forest-600 focus:ring-forest-500"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            isRevision ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
          }`}>
            v{sub.version}
          </span>
          <p className="text-sm font-medium text-gray-900 truncate">{sub.fileName}</p>
        </div>
        <p className="text-xs text-gray-400">
          {new Date(sub.submittedAt).toLocaleString()}
          {isRevision && <span className="ml-1 text-amber-600">(Revision)</span>}
        </p>
      </div>
      <div className="w-24 flex items-center justify-center gap-1.5">
        {getStatusIcon(sub.status)}
        <span className="text-xs text-gray-600">{getStatusLabel(sub.status)}</span>
      </div>
      <div className="w-36 flex items-center justify-end gap-1">
        {sub.feedbackReleased && sub.feedbackToken && (
          <>
            <button
              onClick={() => copyMagicLink(sub.feedbackToken!)}
              className={`p-1 rounded text-xs flex items-center gap-0.5 ${
                copiedToken === sub.feedbackToken
                  ? 'text-green-600 bg-green-50'
                  : 'text-forest-600 hover:bg-forest-50'
              }`}
              title="Copy student link"
            >
              {copiedToken === sub.feedbackToken ? (
                <><CheckCircle className="w-3 h-3" /> Copied</>
              ) : (
                <><Copy className="w-3 h-3" /> Link</>
              )}
            </button>
            <a
              href={`/feedback/${sub.feedbackToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-forest-600 hover:bg-forest-50 rounded"
              title="Open student view"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </>
        )}
        {sub.feedbackReleased && !sub.feedbackToken && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            sub.feedbackViewedAt
              ? 'bg-green-100 text-green-700'
              : 'bg-forest-100 text-forest-700'
          }`}>
            {sub.feedbackViewedAt ? 'Viewed' : 'Released'}
          </span>
        )}
        {(sub.status === 'ready' || sub.status === 'reviewed') && (
          <button
            onClick={() => setViewingSubmissionId(sub.id)}
            className="p-1 text-forest-600 hover:bg-forest-50 rounded"
            title="View feedback"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => handleDeleteSubmission(sub.id)}
          className="p-1 text-gray-400 hover:text-red-500 rounded"
          title="Delete submission"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {/* Select all header */}
      <div className="flex items-center gap-3 px-3 py-2 text-xs text-gray-500 border-b border-gray-100 mb-1">
        <input
          type="checkbox"
          checked={selectedIds.size === submissions.length && submissions.length > 0}
          onChange={toggleSelectAll}
          className="rounded border-gray-300 text-forest-600 focus:ring-forest-500"
        />
        <span className="flex-1">Submissions (grouped by student)</span>
        <span className="w-24 text-center">Status</span>
        <span className="w-36"></span>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.studentId || 'unassigned'} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Student header */}
            <div className={`px-3 py-2 flex items-center gap-2 ${
              group.studentId ? 'bg-green-50' : 'bg-amber-50'
            }`}>
              {group.studentId ? (
                <User className="w-4 h-4 text-green-600" />
              ) : (
                <UserPlus className="w-4 h-4 text-amber-600" />
              )}
              <span className={`font-medium text-sm ${
                group.studentId ? 'text-green-800' : 'text-amber-800'
              }`}>
                {group.studentName || 'Unassigned Submissions'}
              </span>
              <span className="text-xs text-gray-500">
                ({group.submissions.length} submission{group.submissions.length !== 1 ? 's' : ''})
              </span>
              {!group.studentId && (
                <span className="text-xs text-amber-600 ml-auto">Link students below</span>
              )}
            </div>

            {/* Submissions for this student */}
            <div className="divide-y divide-gray-100">
              {group.submissions.map((sub) => (
                <div key={sub.id}>
                  {/* For unassigned, show student selector */}
                  {!group.studentId ? (
                    <div className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 ${
                      selectedIds.has(sub.id) ? 'bg-forest-50/50' : ''
                    }`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(sub.id)}
                        onChange={() => toggleSelect(sub.id)}
                        className="rounded border-gray-300 text-forest-600 focus:ring-forest-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            v{sub.version}
                          </span>
                          <p className="text-sm font-medium text-gray-900 truncate">{sub.fileName}</p>
                        </div>
                        <p className="text-xs text-gray-400">{new Date(sub.submittedAt).toLocaleString()}</p>
                      </div>
                      <div className="w-40">
                        <select
                          className="text-xs border border-amber-300 rounded px-1.5 py-1 bg-white w-full"
                          value=""
                          onChange={(e) => handleLinkStudent(sub.id, e.target.value)}
                        >
                          <option value="">Link to student...</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24 flex items-center justify-center gap-1.5">
                        {getStatusIcon(sub.status)}
                        <span className="text-xs text-gray-600">{getStatusLabel(sub.status)}</span>
                      </div>
                      <div className="w-28 flex items-center justify-end gap-1">
                        {(sub.status === 'ready' || sub.status === 'reviewed') && (
                          <button
                            onClick={() => setViewingSubmissionId(sub.id)}
                            className="p-1 text-forest-600 hover:bg-forest-50 rounded"
                            title="View feedback"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSubmission(sub.id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded"
                          title="Delete submission"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    renderSubmissionRow(sub, sub.version > 1)
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssignmentDetailModal({ assignmentId, onClose, onUpdate, onStartGrading }: {
  assignmentId: string;
  onClose: () => void;
  onUpdate: (assignment: Partial<Assignment> & { id: string }) => void;
  onStartGrading: (assignment: Assignment) => void;
}) {
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState<'submissions' | 'upload'>('submissions');

  // Selection for regrade
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Students for linking
  const [students, setStudents] = useState<Student[]>([]);

  // Feedback viewer
  const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(null);

  // Release
  const [releasing, setReleasing] = useState(false);
  const [releaseResult, setReleaseResult] = useState<string | null>(null);

  // Copy link
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Polling for grading progress
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAssignment();
    loadStudents();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [assignmentId]);

  // Poll when grading is in progress
  useEffect(() => {
    if (assignment?.gradingStatus === 'in_progress' && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        loadAssignment();
      }, 3000);
    } else if (assignment?.gradingStatus !== 'in_progress' && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [assignment?.gradingStatus]);

  const loadAssignment = async () => {
    try {
      const isInitialLoad = !assignment;
      if (isInitialLoad) setLoading(true);
      const data = await assignmentsApi.getById(assignmentId);
      setAssignment(data);
      setEditName(data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const data = await studentsApi.getAll();
      setStudents(data);
    } catch (err) {
      console.error('Failed to load students:', err);
    }
  };

  const handleSaveName = async () => {
    if (!editName.trim() || !assignment) return;
    setSaving(true);
    try {
      const updated = await assignmentsApi.update(assignmentId, { name: editName.trim() });
      setAssignment({ ...assignment, name: updated.name });
      onUpdate({ id: assignmentId, name: updated.name });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkStudent = async (submissionId: string, studentId: string) => {
    if (!assignment) return;
    try {
      await studentsApi.linkSubmission(submissionId, studentId);
      const student = students.find(s => s.id === studentId);
      setAssignment({
        ...assignment,
        submissions: assignment.submissions.map(s =>
          s.id === submissionId
            ? { ...s, studentId, studentName: student?.name, studentEmail: student?.email }
            : s
        )
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link student');
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!assignment || !confirm('Delete this submission?')) return;
    try {
      await submissionsApi.delete(submissionId);
      setAssignment({
        ...assignment,
        submissions: assignment.submissions.filter(s => s.id !== submissionId)
      });
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(submissionId);
        return next;
      });
      onUpdate({ id: assignmentId, submissionCount: assignment.submissions.length - 1 } as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete submission');
    }
  };

  const handleRegradeSelected = async () => {
    if (!assignment || selectedIds.size === 0) return;
    try {
      await assignmentsApi.regradeSelected(assignmentId, Array.from(selectedIds));
      setAssignment({
        ...assignment,
        gradingStatus: 'in_progress' as const,
        gradingProgress: 0,
        gradingTotal: selectedIds.size,
        submissions: assignment.submissions.map(s =>
          selectedIds.has(s.id) ? { ...s, status: 'processing' as const, feedbackReleased: false } : s
        )
      });
      setSelectedIds(new Set());
      onUpdate({ id: assignmentId, gradingStatus: 'in_progress', gradingProgress: 0, gradingTotal: selectedIds.size } as any);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start regrade');
    }
  };

  const handleReleaseFeedback = async () => {
    if (!assignment) return;
    setReleasing(true);
    setReleaseResult(null);
    try {
      const result = await studentsApi.releaseFeedback(assignmentId, false);
      setReleaseResult(`Released feedback for ${result.released.length} submission(s)`);
      // Reload to get updated feedbackReleased flags
      await loadAssignment();
      setTimeout(() => setReleaseResult(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release feedback');
    } finally {
      setReleasing(false);
    }
  };

  const copyMagicLink = (token: string) => {
    const url = `${window.location.origin}/feedback/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleUploadComplete = async () => {
    await loadAssignment();
    const all = await assignmentsApi.getAll();
    const updated = all.find(a => a.id === assignmentId);
    if (updated) onUpdate(updated);
    setActiveTab('submissions');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
      case 'reviewed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-amber-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return 'Feedback Ready';
      case 'reviewed': return 'Reviewed';
      case 'processing': return 'Processing';
      default: return 'Pending';
    }
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!assignment) return;
    if (selectedIds.size === assignment.submissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assignment.submissions.map(s => s.id)));
    }
  };

  // Calculate stats
  const stats = assignment ? {
    total: assignment.submissions.length,
    graded: assignment.submissions.filter(s => s.status === 'ready' || s.status === 'reviewed').length,
    linked: assignment.submissions.filter(s => s.studentId).length,
    released: assignment.submissions.filter(s => s.feedbackReleased).length,
  } : null;

  // Can release: has graded + linked submissions that haven't been released yet
  const canRelease = assignment?.submissions.some(
    s => (s.status === 'ready' || s.status === 'reviewed') && s.studentId && !s.feedbackReleased
  );

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <Loader2 className="w-8 h-8 animate-spin text-forest-600 mx-auto" />
          <p className="mt-3 text-gray-600">Loading assignment...</p>
        </div>
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">Close</button>
        </div>
      </div>
    );
  }

  if (!assignment) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {/* Feedback Viewer Overlay */}
      {viewingSubmissionId && (
        <FeedbackViewer
          submissionId={viewingSubmissionId}
          onClose={() => setViewingSubmissionId(null)}
        />
      )}

      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-forest-100 rounded-lg">
              <BookOpen className="w-5 h-5 text-forest-600" />
            </div>
            {editing ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 px-3 py-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 text-lg font-semibold"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') { setEditing(false); setEditName(assignment.name); }
                  }}
                />
                <button
                  onClick={handleSaveName}
                  disabled={saving || !editName.trim()}
                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditName(assignment.name); }}
                  className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{assignment.name}</h2>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1 text-gray-400 hover:text-forest-600 hover:bg-forest-50 rounded"
                  title="Rename assignment"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Info Bar */}
        <div className="px-4 py-3 bg-surface border-b border-gray-200 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">Rubric:</span>
            <span className={assignment.rubricName ? 'font-medium text-gray-900' : 'text-amber-600'}>
              {assignment.rubricName || 'None linked'}
            </span>
          </div>
          {assignment.dueDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">Due:</span>
              <span className="font-medium text-gray-900">
                {new Date(assignment.dueDate).toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Created:</span>
            <span className="text-gray-500">{new Date(assignment.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Stats */}
        {stats && stats.total > 0 && (
          <div className="px-4 py-3 border-b border-gray-200 grid grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500">Submissions</p>
            </div>
            <div className="bg-green-50 rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-green-700">{stats.graded}</p>
              <p className="text-xs text-green-600">Feedback Ready</p>
            </div>
            <div className="bg-forest-50 rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-forest-700">{stats.linked}</p>
              <p className="text-xs text-forest-600">Linked</p>
            </div>
            <div className="bg-forest-50 rounded-lg p-2.5 text-center">
              <p className="text-xl font-bold text-forest-700">{stats.released}</p>
              <p className="text-xs text-forest-600">Released</p>
            </div>
          </div>
        )}

        {/* Grading Progress Bar */}
        {assignment.gradingStatus === 'in_progress' && (
          <div className="px-4 py-3 border-b border-gray-200 bg-blue-50">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-blue-700 flex items-center gap-1.5 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generating feedback...
              </span>
              <span className="text-blue-600">
                {assignment.gradingProgress}/{assignment.gradingTotal}
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{
                  width: `${assignment.gradingTotal > 0
                    ? (assignment.gradingProgress / assignment.gradingTotal) * 100
                    : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('submissions')}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${
              activeTab === 'submissions'
                ? 'border-forest-600 text-forest-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Submissions ({assignment.submissions.length})
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-forest-600 text-forest-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Upload
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xs">Dismiss</button>
          </div>
        )}

        {/* Release success banner */}
        {releaseResult && (
          <div className="mx-4 mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <p className="text-green-700">{releaseResult}</p>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'submissions' && (
            <div className="p-4">
              {/* Bulk action bar */}
              {selectedIds.size > 0 && (
                <div className="mb-3 p-3 bg-forest-50 border border-forest-200 rounded-lg flex items-center justify-between">
                  <span className="text-sm text-forest-700 font-medium">
                    {selectedIds.size} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="text-sm text-gray-600 hover:text-gray-800 px-2 py-1"
                    >
                      Clear
                    </button>
                    {assignment.rubricName && assignment.gradingStatus !== 'in_progress' && (
                      <button
                        onClick={handleRegradeSelected}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 text-sm"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regenerate Selected ({selectedIds.size})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {assignment.submissions.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium text-gray-700 mb-1">No submissions yet</p>
                  <p className="text-sm mb-4">Upload student work to get started</p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="inline-flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 text-sm"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Files
                  </button>
                </div>
              ) : (
                <SubmissionsGroupedByStudent
                  submissions={assignment.submissions}
                  students={students}
                  selectedIds={selectedIds}
                  copiedToken={copiedToken}
                  toggleSelect={toggleSelect}
                  toggleSelectAll={toggleSelectAll}
                  handleLinkStudent={handleLinkStudent}
                  handleDeleteSubmission={handleDeleteSubmission}
                  copyMagicLink={copyMagicLink}
                  setViewingSubmissionId={setViewingSubmissionId}
                  getStatusIcon={getStatusIcon}
                  getStatusLabel={getStatusLabel}
                />
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <UploadTab assignmentId={assignmentId} onUploadComplete={handleUploadComplete} />
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
          >
            Close
          </button>
          <div className="flex items-center gap-2">
            {canRelease && (
              <button
                onClick={handleReleaseFeedback}
                disabled={releasing}
                className="flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50 text-sm"
              >
                {releasing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {releasing ? 'Releasing...' : 'Release Feedback'}
              </button>
            )}
            {assignment.rubricName &&
             assignment.submissions.length > 0 &&
             assignment.gradingStatus !== 'in_progress' && (
              <button
                onClick={() => onStartGrading(assignment as unknown as Assignment)}
                className="flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 text-sm"
              >
                <Play className="w-4 h-4 mr-2" />
                {assignment.gradingStatus === 'completed' ? 'Regenerate All' : 'Generate All Feedback'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
