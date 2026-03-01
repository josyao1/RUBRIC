/**
 * Assignments — Teacher assignment management
 *
 * Teacher creates assignments (which auto-generate a join code), then shares
 * the code with students. Students submit via the portal. Teacher can review
 * feedback per-submission and regrade if needed. No manual upload or release.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Plus, BookOpen, Calendar, FileText, Trash2, Loader2, AlertCircle,
  CheckCircle, XCircle, X, Eye, Edit3, Save,
  Copy, Users
} from 'lucide-react';
import {
  assignmentsApi, rubricsApi, studentsApi,
  type Assignment, type AssignmentDetail, type Rubric
} from '../services/api';
import FeedbackViewer from '../components/FeedbackViewer';

export default function Assignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const pollingRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    loadAssignments();
    return () => { Object.values(pollingRef.current).forEach(clearInterval); };
  }, []);

  // Poll assignments that are in_progress
  useEffect(() => {
    assignments.forEach(a => {
      if (a.gradingStatus === 'in_progress' && !pollingRef.current[a.id]) {
        pollingRef.current[a.id] = setInterval(async () => {
          try {
            const status = await assignmentsApi.getGradingStatus(a.id);
            setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, ...status } : x));
            if (status.gradingStatus !== 'in_progress') {
              clearInterval(pollingRef.current[a.id]);
              delete pollingRef.current[a.id];
            }
          } catch { /* ignore */ }
        }, 3000);
      } else if (a.gradingStatus !== 'in_progress' && pollingRef.current[a.id]) {
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assignments</h1>
          <p className="text-gray-600 mt-1">Create assignments and share the join code with students</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Assignment
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {showCreate && (
        <CreateAssignmentModal
          onClose={() => setShowCreate(false)}
          onCreate={(assignment) => { setAssignments([assignment, ...assignments]); setShowCreate(false); }}
        />
      )}

      {selectedAssignmentId && (
        <AssignmentDetailModal
          assignmentId={selectedAssignmentId}
          onClose={() => setSelectedAssignmentId(null)}
          onUpdate={(updated) => {
            setAssignments(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
          }}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
          <span className="ml-3 text-gray-600">Loading assignments...</span>
        </div>
      )}

      {!loading && assignments.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments yet</h3>
          <p className="text-gray-500 mb-6">Create an assignment to get a join code to share with students.</p>
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
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              onOpen={() => setSelectedAssignmentId(assignment.id)}
              onDelete={() => handleDelete(assignment.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ assignment, onOpen, onDelete }: {
  assignment: Assignment;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (assignment.joinCode) {
      navigator.clipboard.writeText(assignment.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2 bg-forest-100 rounded-lg">
          <BookOpen className="w-5 h-5 text-forest-600" />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-400 hover:text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <h3 className="font-semibold text-gray-900 mb-2">{assignment.name}</h3>

      {/* Join code badge */}
      {assignment.joinCode && (
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono font-bold text-lg tracking-widest text-forest-700 bg-forest-50 border border-forest-200 px-3 py-1 rounded-lg">
            {assignment.joinCode}
          </span>
          <button
            onClick={copyCode}
            className={`p-1.5 rounded transition-colors ${copied ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-forest-600 hover:bg-forest-50'}`}
            title="Copy join code"
          >
            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      )}

      {assignment.rubricName ? (
        <div className="flex items-center text-sm text-green-600 mb-2">
          <FileText className="w-4 h-4 mr-1" /> {assignment.rubricName}
        </div>
      ) : (
        <div className="flex items-center text-sm text-yellow-600 mb-2">
          <FileText className="w-4 h-4 mr-1" /> No rubric linked
        </div>
      )}

      {assignment.dueDate && (
        <div className="flex items-center text-sm text-gray-500 mb-3">
          <Calendar className="w-4 h-4 mr-1" />
          Due: {new Date(assignment.dueDate).toLocaleDateString()}
        </div>
      )}

      {assignment.gradingStatus === 'in_progress' && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-blue-600 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Generating feedback...
            </span>
            <span className="text-gray-500">{assignment.gradingProgress}/{assignment.gradingTotal}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${assignment.gradingTotal > 0 ? (assignment.gradingProgress / assignment.gradingTotal) * 100 : 0}%` }}
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
          <XCircle className="w-4 h-4 mr-1" /> Feedback error — try regrading
        </div>
      )}

      <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
        <span className="text-gray-500">
          {assignment.submissionCount} submission{assignment.submissionCount !== 1 ? 's' : ''}
        </span>
      </div>
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
    rubricsApi.getAll()
      .then(setRubrics)
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingRubrics(false));
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
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
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
                <Loader2 className="w-4 h-4 animate-spin" /> Loading rubrics...
              </div>
            ) : (
              <select
                value={rubricId}
                onChange={(e) => setRubricId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500"
              >
                <option value="">Select a rubric (optional)</option>
                {rubrics.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.criteria?.length || 0} criteria)</option>
                ))}
              </select>
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
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
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

function AssignmentDetailModal({ assignmentId, onClose, onUpdate }: {
  assignmentId: string;
  onClose: () => void;
  onUpdate: (assignment: Partial<Assignment> & { id: string }) => void;
}) {
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [prefsText, setPrefsText] = useState('');
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [subTab, setSubTab] = useState<'submissions' | 'students'>('submissions');

  // Students tab state
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingStudentName, setEditingStudentName] = useState('');
  const [savingStudent, setSavingStudent] = useState(false);
  const [addingStudent, setAddingStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [addingStudentSaving, setAddingStudentSaving] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAssignment();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [assignmentId]);

  useEffect(() => {
    if (assignment?.gradingStatus === 'in_progress' && !pollingRef.current) {
      pollingRef.current = setInterval(() => loadAssignment(), 3000);
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
      setPrefsText(data.teacherPreferences ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignment');
    } finally {
      setLoading(false);
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


  const copyCode = () => {
    if (assignment?.joinCode) {
      navigator.clipboard.writeText(assignment.joinCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleSavePrefs = async () => {
    if (!assignment) return;
    setPrefsSaving(true);
    try {
      await assignmentsApi.update(assignmentId, { teacherPreferences: prefsText.trim() || undefined });
      setAssignment({ ...assignment, teacherPreferences: prefsText.trim() || null });
      setPrefsSaved(true);
      setTimeout(() => setPrefsSaved(false), 2000);
    } catch { /* ignore */ } finally {
      setPrefsSaving(false);
    }
  };



  const handleRenameStudent = async (studentId: string) => {
    if (!editingStudentName.trim() || !assignment) return;
    setSavingStudent(true);
    try {
      await studentsApi.update(studentId, { name: editingStudentName.trim() });
      setAssignment({
        ...assignment,
        submissions: assignment.submissions.map(s =>
          s.studentId === studentId ? { ...s, studentName: editingStudentName.trim() } : s
        )
      });
      setEditingStudentId(null);
    } catch { /* ignore */ } finally {
      setSavingStudent(false);
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!assignment || !confirm('Delete this student and all their submissions?')) return;
    try {
      await studentsApi.delete(studentId);
      setAssignment({
        ...assignment,
        submissions: assignment.submissions.filter(s => s.studentId !== studentId)
      });
    } catch { /* ignore */ }
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim() || !assignment) return;
    setAddingStudentSaving(true);
    try {
      await studentsApi.create({ name: newStudentName.trim() });
      setNewStudentName('');
      setAddingStudent(false);
      // Refresh to pick up the new student if they submit
      await loadAssignment();
    } catch { /* ignore */ } finally {
      setAddingStudentSaving(false);
    }
  };

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

  // Only show root submissions (non-revisions), sorted by student name
  const rootSubmissions = assignment.submissions.filter(s => !s.parentSubmissionId);
  const sortedSubmissions = [...rootSubmissions].sort((a, b) =>
    (a.studentName || '').toLowerCase().localeCompare((b.studentName || '').toLowerCase())
  );

  // Unique students derived from submissions
  const uniqueStudents = (() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    for (const s of rootSubmissions) {
      if (s.studentId && !seen.has(s.studentId)) {
        seen.add(s.studentId);
        result.push({ id: s.studentId, name: s.studentName || 'Unknown' });
      }
    }
    return result.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  })();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {viewingSubmissionId && (
        <FeedbackViewer
          submissionId={viewingSubmissionId}
          onClose={() => setViewingSubmissionId(null)}
        />
      )}

      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
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
                <button onClick={handleSaveName} disabled={saving || !editName.trim()} className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
                <button onClick={() => { setEditing(false); setEditName(assignment.name); }} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{assignment.name}</h2>
                <button onClick={() => setEditing(true)} className="p-1 text-gray-400 hover:text-forest-600 hover:bg-forest-50 rounded">
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Join code + info bar */}
        <div className="px-4 py-3 bg-surface border-b border-gray-200 flex flex-wrap items-center gap-4 text-sm">
          {assignment.joinCode && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Join code:</span>
              <span className="font-mono font-bold text-lg tracking-widest text-forest-700 bg-forest-50 border border-forest-200 px-2.5 py-0.5 rounded-lg">
                {assignment.joinCode}
              </span>
              <button
                onClick={copyCode}
                className={`p-1.5 rounded transition-colors ${codeCopied ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-forest-600 hover:bg-forest-50'}`}
                title="Copy code"
              >
                {codeCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <span className={assignment.rubricName ? 'font-medium text-gray-900' : 'text-amber-600'}>
              {assignment.rubricName || 'No rubric linked'}
            </span>
          </div>
          {assignment.dueDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-900">{new Date(assignment.dueDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Feedback instructions */}
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              Feedback Instructions
            </label>
            {prefsSaving ? (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Saving…
              </span>
            ) : prefsSaved ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" /> Saved
              </span>
            ) : null}
          </div>
          <textarea
            value={prefsText}
            onChange={(e) => setPrefsText(e.target.value)}
            onBlur={handleSavePrefs}
            rows={3}
            placeholder="Add context or guidelines for the AI — e.g. 'This is a 9th grade class, keep language accessible' or 'Focus on argument structure and evidence use'"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent resize-none text-gray-800 placeholder-gray-400"
          />
        </div>

        {/* Grading progress */}
        {assignment.gradingStatus === 'in_progress' && (
          <div className="px-4 py-3 border-b border-gray-200 bg-blue-50">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-blue-700 flex items-center gap-1.5 font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating feedback...
              </span>
              <span className="text-blue-600">{assignment.gradingProgress}/{assignment.gradingTotal}</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ width: `${assignment.gradingTotal > 0 ? (assignment.gradingProgress / assignment.gradingTotal) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-red-700 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xs">Dismiss</button>
          </div>
        )}

        {/* Subtabs */}
        <div className="flex border-b border-gray-200 px-4 pt-1">
          <button
            onClick={() => setSubTab('submissions')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              subTab === 'submissions'
                ? 'border-forest-600 text-forest-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Submissions ({rootSubmissions.length})
          </button>
          <button
            onClick={() => setSubTab('students')}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              subTab === 'students'
                ? 'border-forest-600 text-forest-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4" />
            Students ({uniqueStudents.length})
          </button>
        </div>

        {/* Submissions tab */}
        {subTab === 'submissions' && (
          <div className="flex-1 overflow-auto p-4">
            {rootSubmissions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="font-medium text-gray-700 mb-1">No submissions yet</p>
                <p className="text-sm">Share the join code above with your students</p>
              </div>
            ) : (
              <div className="space-y-1">
                {sortedSubmissions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {sub.studentName || <span className="text-gray-400 italic">Unknown</span>}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{sub.fileName}</p>
                    </div>
                    {(sub.status === 'processing' || sub.status === 'pending') && (
                      <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
                    )}
                    {(sub.status === 'ready' || sub.status === 'reviewed') && (
                      <button
                        onClick={() => setViewingSubmissionId(sub.id)}
                        className="p-1 text-forest-600 hover:bg-forest-50 rounded flex-shrink-0"
                        title="View feedback"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Students tab */}
        {subTab === 'students' && (
          <div className="flex-1 overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <span />
              <button
                onClick={() => { setAddingStudent(true); setNewStudentName(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 text-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Student
              </button>
            </div>

            {addingStudent && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-forest-50 border border-forest-200 rounded-lg">
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Student name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddStudent();
                    if (e.key === 'Escape') setAddingStudent(false);
                  }}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-forest-500"
                />
                <button
                  onClick={handleAddStudent}
                  disabled={!newStudentName.trim() || addingStudentSaving}
                  className="px-3 py-1 bg-forest-600 text-white rounded text-sm hover:bg-forest-700 disabled:opacity-50"
                >
                  {addingStudentSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
                </button>
                <button onClick={() => setAddingStudent(false)} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {uniqueStudents.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="font-medium text-gray-700 mb-1">No students yet</p>
                <p className="text-sm">Students appear here once they join via the code</p>
              </div>
            ) : (
              <div className="space-y-1">
                {uniqueStudents.map((student) => (
                  <div key={student.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                    {editingStudentId === student.id ? (
                      <>
                        <input
                          type="text"
                          value={editingStudentName}
                          onChange={(e) => setEditingStudentName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameStudent(student.id);
                            if (e.key === 'Escape') setEditingStudentId(null);
                          }}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-forest-500"
                        />
                        <button
                          onClick={() => handleRenameStudent(student.id)}
                          disabled={!editingStudentName.trim() || savingStudent}
                          className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                        >
                          {savingStudent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setEditingStudentId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-gray-900">{student.name}</span>
                        <button
                          onClick={() => { setEditingStudentId(student.id); setEditingStudentName(student.name); }}
                          className="p-1 text-gray-400 hover:text-forest-600 hover:bg-forest-50 rounded"
                          title="Rename"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(student.id)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                          title="Remove student"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
