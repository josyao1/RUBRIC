import { useState, useEffect, useRef } from 'react';
import {
  Users, Plus, Upload, Trash2, Loader2, AlertCircle,
  FileText, Send, CheckCircle, Copy, ExternalLink, Eye, Clock
} from 'lucide-react';
import {
  studentsApi, assignmentsApi, submissionsApi,
  type Student, type Assignment, type Submission, type ReleasedFeedback
} from '../services/api';

export default function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showRelease, setShowRelease] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [studentsData, assignmentsData, submissionsData] = await Promise.all([
        studentsApi.getAll(),
        assignmentsApi.getAll(),
        submissionsApi.getAll()
      ]);
      setStudents(studentsData);
      setAssignments(assignmentsData);
      setSubmissions(submissionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this student? Their submissions will be unlinked.')) return;
    try {
      await studentsApi.delete(id);
      setStudents(students.filter(s => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleLinkSubmission = async (submissionId: string, studentId: string) => {
    try {
      await studentsApi.linkSubmission(submissionId, studentId);
      await loadData(); // Reload to update links
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link submission');
    }
  };

  // Get unlinked submissions
  const unlinkedSubmissions = submissions.filter(s => !s.studentId);

  // Copy magic link to clipboard
  const copyMagicLink = (token: string) => {
    const url = `${window.location.origin}/feedback/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // Get released submissions for a student
  const getReleasedSubmissions = (student: Student) => {
    return student.submissions?.filter(s => s.feedbackReleased && s.feedbackToken) || [];
  };

  // Get submission status summary for a student
  const getSubmissionStatusSummary = (student: Student) => {
    const subs = student.submissions || [];
    const pending = subs.filter(s => s.status === 'pending').length;
    const processing = subs.filter(s => s.status === 'processing').length;
    const ready = subs.filter(s => s.status === 'ready' || s.status === 'reviewed').length;
    return { total: subs.length, pending, processing, ready };
  };

  // Get submissions that need re-release (regraded but not yet re-released)
  const getNeedsRereleaseSubmissions = (student: Student) => {
    return student.submissions?.filter(s =>
      (s.status === 'ready' || s.status === 'reviewed') &&
      !s.feedbackReleased &&
      s.feedbackToken // Has a token from previous release
    ) || [];
  };

  // Get submissions that are ready but never released
  const getReadyNotReleasedSubmissions = (student: Student) => {
    return student.submissions?.filter(s =>
      (s.status === 'ready' || s.status === 'reviewed') &&
      !s.feedbackReleased &&
      !s.feedbackToken // Never had a token
    ) || [];
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-gray-600 mt-1">Manage student roster and release feedback</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </button>
          <button
            onClick={() => setShowAddStudent(true)}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Student
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {/* Modals */}
      {showAddStudent && (
        <AddStudentModal
          onClose={() => setShowAddStudent(false)}
          onAdd={(student) => {
            setStudents([...students, student]);
            setShowAddStudent(false);
          }}
        />
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={(created) => {
            setStudents([...students, ...created]);
            setShowImport(false);
          }}
        />
      )}

      {showRelease && (
        <ReleaseModal
          assignments={assignments}
          onClose={() => setShowRelease(false)}
          onRelease={loadData}
        />
      )}

      {/* Release Feedback Button */}
      <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between">
        <div>
          <h3 className="font-medium text-indigo-900">Release Feedback to Students</h3>
          <p className="text-sm text-indigo-700">Generate magic links and optionally email students</p>
        </div>
        <button
          onClick={() => setShowRelease(true)}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Send className="w-4 h-4 mr-2" />
          Release Feedback
        </button>
      </div>

      {/* Unlinked Submissions Warning */}
      {unlinkedSubmissions.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="font-medium text-amber-900 mb-2">
            {unlinkedSubmissions.length} Unlinked Submission{unlinkedSubmissions.length > 1 ? 's' : ''}
          </h3>
          <p className="text-sm text-amber-700 mb-3">
            These submissions need to be linked to students before feedback can be released.
          </p>
          <div className="space-y-2 max-h-40 overflow-auto">
            {unlinkedSubmissions.map(sub => (
              <div key={sub.id} className="flex items-center gap-3 bg-white p-2 rounded border border-amber-200">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700 flex-1 truncate">{sub.fileName}</span>
                <select
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleLinkSubmission(sub.id, e.target.value);
                  }}
                >
                  <option value="">Link to student...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      )}

      {/* Students List */}
      {!loading && students.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No students yet</h3>
          <p className="text-gray-500 mb-6">Add students manually or import from CSV.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import CSV
            </button>
            <button
              onClick={() => setShowAddStudent(true)}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Student
            </button>
          </div>
        </div>
      ) : !loading && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Email</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Submissions</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">Feedback Links</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {students.map(student => {
                const releasedSubs = getReleasedSubmissions(student);
                const statusSummary = getSubmissionStatusSummary(student);
                return (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <div>
                          <span className="font-medium text-gray-900">{student.name}</span>
                          {student.studentId && (
                            <span className="text-xs text-gray-400 ml-2">#{student.studentId}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {student.email ? (
                        <span className="text-gray-700 text-sm">{student.email}</span>
                      ) : (
                        <span className="text-gray-400 italic text-sm">No email</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {statusSummary.total === 0 ? (
                        <span className="text-gray-400 italic text-sm">None</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {statusSummary.ready > 0 && (
                            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full" title="Feedback ready">
                              <CheckCircle className="w-3 h-3" /> {statusSummary.ready}
                            </span>
                          )}
                          {statusSummary.pending > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full" title="Awaiting feedback">
                              <Clock className="w-3 h-3" /> {statusSummary.pending}
                            </span>
                          )}
                          {statusSummary.processing > 0 && (
                            <span className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full" title="Generating feedback">
                              <Loader2 className="w-3 h-3 animate-spin" /> {statusSummary.processing}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {/* Released submissions - show copy link */}
                        {releasedSubs.map(sub => (
                          <div key={sub.id} className="flex items-center gap-1">
                            <button
                              onClick={() => copyMagicLink(sub.feedbackToken!)}
                              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full transition-colors ${
                                copiedToken === sub.feedbackToken
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                              }`}
                              title={sub.assignment?.name || sub.fileName}
                            >
                              {copiedToken === sub.feedbackToken ? (
                                <><CheckCircle className="w-3 h-3" /> Copied</>
                              ) : (
                                <><Copy className="w-3 h-3" /> {sub.assignment?.name || 'Link'}</>
                              )}
                            </button>
                            <a
                              href={`/feedback/${sub.feedbackToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-indigo-600"
                              title="Open feedback"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            {sub.feedbackViewedAt && (
                              <span className="text-green-500" title={`Viewed ${new Date(sub.feedbackViewedAt).toLocaleString()}`}>
                                <Eye className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        ))}
                        {/* Regenerated submissions - needs re-release */}
                        {getNeedsRereleaseSubmissions(student).map(sub => (
                          <span
                            key={sub.id}
                            className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700"
                            title={`${sub.assignment?.name || sub.fileName} - Regenerated, needs re-release`}
                          >
                            <AlertCircle className="w-3 h-3" />
                            Re-release needed
                          </span>
                        ))}
                        {/* Ready but never released */}
                        {getReadyNotReleasedSubmissions(student).length > 0 && (
                          <span className="text-xs text-gray-500">
                            {getReadyNotReleasedSubmissions(student).length} ready to release
                          </span>
                        )}
                        {/* No submissions or all pending */}
                        {releasedSubs.length === 0 &&
                         getNeedsRereleaseSubmissions(student).length === 0 &&
                         getReadyNotReleasedSubmissions(student).length === 0 &&
                         statusSummary.total > 0 && (
                          <span className="text-gray-400 text-sm italic">Awaiting feedback</span>
                        )}
                        {statusSummary.total === 0 && (
                          <span className="text-gray-400 text-sm italic">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(student.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Add Student Modal
function AddStudentModal({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (student: Student) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const student = await studentsApi.create({ name, email: email || undefined, studentId: studentId || undefined });
      onAdd(student);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add student');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Add Student</h2>
        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="John Smith"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="john@school.edu"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Student ID (optional)</label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="12345"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || saving}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Add Student
          </button>
        </div>
      </div>
    </div>
  );
}

// Import CSV Modal
function ImportModal({ onClose, onImport }: {
  onClose: () => void;
  onImport: (students: Student[]) => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: Student[]; skipped: any[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setCsvText(e.target?.result as string || '');
      };
      reader.readAsText(file);
    }
  };

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const students: { name: string; email: string; studentId?: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip header row if it looks like headers
      if (i === 0 && (line.toLowerCase().includes('name') || line.toLowerCase().includes('email'))) {
        continue;
      }

      const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2) {
        students.push({
          name: parts[0],
          email: parts[1],
          studentId: parts[2] || undefined
        });
      }
    }
    return students;
  };

  const handleImport = async () => {
    const students = parseCSV(csvText);
    if (students.length === 0) {
      return;
    }

    setImporting(true);
    try {
      const result = await studentsApi.import(students);
      setResult(result);
      if (result.created.length > 0) {
        onImport(result.created);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Import Students from CSV</h2>

        {!result ? (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Upload a CSV file or paste CSV data. Format: <code className="bg-gray-100 px-1 rounded">name,email,studentId</code>
            </p>

            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-indigo-500 text-center"
              >
                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                <span className="text-sm text-gray-600">Click to upload CSV file</span>
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Or paste CSV data:</label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 h-32 font-mono text-sm"
                placeholder="John Smith,john@school.edu,12345&#10;Jane Doe,jane@school.edu,12346"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!csvText.trim() || importing}
                className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Import
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              {result.created.length > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
                  <p className="text-green-800 font-medium">
                    <CheckCircle className="w-4 h-4 inline mr-2" />
                    {result.created.length} student{result.created.length !== 1 ? 's' : ''} imported
                  </p>
                </div>
              )}
              {result.skipped.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-amber-800 font-medium mb-2">
                    {result.skipped.length} skipped:
                  </p>
                  <ul className="text-sm text-amber-700 list-disc list-inside">
                    {result.skipped.slice(0, 5).map((s, i) => (
                      <li key={i}>{s.name || s.email}: {s.reason}</li>
                    ))}
                    {result.skipped.length > 5 && <li>...and {result.skipped.length - 5} more</li>}
                  </ul>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Release Feedback Modal
function ReleaseModal({ assignments, onClose, onRelease }: {
  assignments: Assignment[];
  onClose: () => void;
  onRelease: () => void;
}) {
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [result, setResult] = useState<{ released: ReleasedFeedback[]; errors: any[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleRelease = async () => {
    if (!selectedAssignment) return;
    setReleasing(true);
    try {
      const result = await studentsApi.releaseFeedback(selectedAssignment, sendEmail);
      setResult(result);
      onRelease();
    } catch (err) {
      console.error(err);
    } finally {
      setReleasing(false);
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/feedback/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const readyAssignments = assignments.filter(a => a.gradingStatus === 'completed');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Release Feedback</h2>

        {!result ? (
          <>
            <p className="text-sm text-gray-600 mb-4">
              Generate magic links for students to view their feedback. Only submissions with linked students and completed feedback will be released.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignment</label>
              <select
                value={selectedAssignment}
                onChange={(e) => setSelectedAssignment(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select an assignment</option>
                {readyAssignments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.submissionCount} submissions)
                  </option>
                ))}
              </select>
              {readyAssignments.length === 0 && (
                <p className="text-sm text-amber-600 mt-2">
                  No assignments with completed feedback. Generate feedback first.
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Send email notifications to students</span>
              </label>
              <p className="text-xs text-gray-500 ml-6 mt-1">
                (Email sending not yet implemented - links will be generated)
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleRelease}
                disabled={!selectedAssignment || releasing}
                className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {releasing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Send className="w-4 h-4 mr-2" />
                Release
              </button>
            </div>
          </>
        ) : (
          <>
            {result.released.length > 0 ? (
              <div className="mb-4">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
                  <p className="text-green-800 font-medium">
                    <CheckCircle className="w-4 h-4 inline mr-2" />
                    Released feedback to {result.released.length} student{result.released.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <h3 className="font-medium text-gray-900 mb-2">Student Links:</h3>
                <div className="space-y-2 max-h-60 overflow-auto">
                  {result.released.map(r => (
                    <div key={r.submissionId} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <span className="flex-1 text-sm text-gray-700 truncate">{r.studentName}</span>
                      <button
                        onClick={() => copyLink(r.token)}
                        className="flex items-center text-xs text-indigo-600 hover:text-indigo-700"
                      >
                        {copied === r.token ? (
                          <><CheckCircle className="w-3 h-3 mr-1" /> Copied</>
                        ) : (
                          <><Copy className="w-3 h-3 mr-1" /> Copy Link</>
                        )}
                      </button>
                      <a
                        href={`/feedback/${r.token}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <p className="text-amber-800">
                  No feedback was released. Make sure submissions have linked students and feedback is generated.
                </p>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                <p className="text-red-800 font-medium">{result.errors.length} errors occurred</p>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
