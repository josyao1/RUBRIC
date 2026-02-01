import { useState, useEffect, useRef } from 'react';
import { Plus, BookOpen, Calendar, FileText, Trash2, Loader2, AlertCircle, Play, CheckCircle, XCircle } from 'lucide-react';
import { assignmentsApi, rubricsApi, type Assignment, type Rubric } from '../services/api';

export default function Assignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [gradingAssignment, setGradingAssignment] = useState<Assignment | null>(null);
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
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
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

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="ml-3 text-gray-600">Loading assignments...</span>
        </div>
      )}

      {/* Assignments List */}
      {!loading && assignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments yet</h3>
          <p className="text-gray-500 mb-6">Create an assignment and link it to a rubric for feedback.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Assignment
          </button>
        </div>
      ) : !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                </div>
                <button
                  onClick={() => handleDelete(assignment.id)}
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
                  Grading error - try again
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
                      onClick={() => setGradingAssignment(assignment)}
                      className="flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      {assignment.gradingStatus === 'completed' ? 'Re-grade' : 'Start Grading'}
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
      <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
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
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
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
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Play className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Start Generating Feedback</h2>
            <p className="text-sm text-gray-500">{assignment.name}</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Submissions to process:</span>
            <span className="font-medium text-gray-900">{assignment.submissionCount}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-gray-600">Rubric:</span>
            <span className="font-medium text-gray-900">{assignment.rubricName}</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Additional Instructions (Optional)
          </label>
          <textarea
            value={preferences}
            onChange={(e) => setPreferences(e.target.value)}
            placeholder="Add any specific preferences for feedback generation...&#10;&#10;Examples:&#10;• Focus more on constructive criticism&#10;• Be encouraging with struggling students&#10;• Pay special attention to grammar&#10;• This is a first draft, be gentle"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 h-32 text-sm resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            These instructions will guide the AI when generating feedback for each submission.
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
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
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
