/**
 * StudentPortal — Two-step student entry flow
 *
 * Step 1: Enter a 6-char join code.
 * Step 2: Pick your name from existing students or add yourself.
 * On identity confirmed, navigates to /student/:code/:studentId.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Loader2, AlertCircle, UserPlus, ChevronRight, User } from 'lucide-react';
import { joinApi } from '../services/api';

const SESSION_KEY = 'fl_student_session';

export default function StudentPortal() {
  const { code: urlCode } = useParams<{ code?: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<'code' | 'identity'>('code');
  const [codeInput, setCodeInput] = useState(urlCode?.toUpperCase() || '');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);

  const [assignment, setAssignment] = useState<{
    assignmentId: string;
    assignmentName: string;
    students: { id: string; name: string }[];
  } | null>(null);

  const [nameInput, setNameInput] = useState('');
  const [showAddMe, setShowAddMe] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // If code is in URL, resolve it on mount
  useEffect(() => {
    if (urlCode) {
      resolveCode(urlCode.toUpperCase());
    }
  }, []);

  const resolveCode = async (code: string) => {
    setCodeLoading(true);
    setCodeError(null);
    try {
      const data = await joinApi.getAssignment(code);
      setAssignment(data);
      setStep('identity');
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Invalid code. Try again.');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeInput.trim() || codeInput.length !== 6) {
      setCodeError('Please enter the 6-character code from your teacher.');
      return;
    }
    await resolveCode(codeInput.toUpperCase());
  };

  const selectStudent = (studentId: string, code: string) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code, studentId }));
    navigate(`/student/${code}/${studentId}`);
  };

  const handleAddMe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !assignment) return;
    setAddLoading(true);
    setAddError(null);
    const code = codeInput.toUpperCase();
    try {
      const student = await joinApi.createStudent(code, nameInput.trim());
      selectStudent(student.id, code);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add name. Try again.');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-forest-700 rounded-2xl mb-4">
            <MessageSquare className="w-7 h-7 text-accent-400" />
          </div>
          <h1 className="text-2xl font-serif font-semibold text-gray-900">FeedbackLab</h1>
          <p className="text-gray-500 mt-1 text-sm">Student Portal</p>
        </div>

        {step === 'code' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Enter your join code</h2>
            <p className="text-sm text-gray-500 mb-6">Your teacher provided a 6-character code for this assignment.</p>

            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="e.g. R7K3MX"
                className="w-full text-center text-2xl font-mono font-bold tracking-widest px-4 py-4 border-2 border-gray-200 rounded-xl focus:border-forest-500 focus:ring-2 focus:ring-forest-200 outline-none uppercase"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />

              {codeError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {codeError}
                </div>
              )}

              <button
                type="submit"
                disabled={codeInput.length !== 6 || codeLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-forest-600 text-white rounded-xl font-medium hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {codeLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Checking...</>
                ) : (
                  <>Continue <ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </div>
        )}

        {step === 'identity' && assignment && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
            <div className="mb-6">
              <p className="text-xs font-medium text-forest-600 uppercase tracking-wide mb-1">Assignment</p>
              <h2 className="text-xl font-semibold text-gray-900">{assignment.assignmentName}</h2>
            </div>

            <p className="text-sm font-medium text-gray-700 mb-3">Who are you?</p>

            {assignment.students.length === 0 ? (
              <p className="text-sm text-gray-400 italic mb-4">No one has joined yet — be the first!</p>
            ) : (
              <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
                {assignment.students.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => selectStudent(student.id, codeInput.toUpperCase())}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-forest-400 hover:bg-forest-50 text-left transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-full bg-forest-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-forest-600" />
                    </div>
                    <span className="font-medium text-gray-900 group-hover:text-forest-700">{student.name}</span>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-forest-500 ml-auto" />
                  </button>
                ))}
              </div>
            )}

            {/* Add me */}
            {!showAddMe ? (
              <button
                onClick={() => setShowAddMe(true)}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-forest-400 hover:text-forest-600 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                I'm not here — add me
              </button>
            ) : (
              <form onSubmit={handleAddMe} className="space-y-3 border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-700">Enter your name</p>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Your full name"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-forest-500 focus:border-forest-500 outline-none"
                  autoFocus
                />
                {addError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {addError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddMe(false); setNameInput(''); setAddError(null); }}
                    className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!nameInput.trim() || addLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-forest-600 text-white rounded-xl text-sm hover:bg-forest-700 disabled:opacity-50"
                  >
                    {addLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</>
                    ) : 'Continue'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
