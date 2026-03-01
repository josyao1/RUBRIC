/**
 * StudentWorkspace — Student's submission and feedback page
 *
 * Fetched via join code + studentId (no magic link). States:
 *   no-submission → upload form
 *   processing     → polling spinner
 *   ready          → tabbed feedback display + resubmit / edit-in-portal
 *   error          → error card
 *
 * Edit-in-Portal flow:
 *   Enters a full-height split-pane editor. Text is auto-saved to localStorage
 *   on every change (2s debounce) as a crash safety net. The explicit Save button
 *   marks a clean checkpoint. Navigation / reload is blocked with a warning when
 *   there are unsaved changes since the last explicit save.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MessageSquare, Loader2, AlertCircle, Upload, FileText, Trash2,
  CheckCircle, ChevronDown, ChevronRight, TrendingUp, Lightbulb,
  ArrowLeft, Bot, Download, Edit3, Save, X, RotateCcw
} from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { joinApi, type JoinSubmissionStatus, type DraftRevision } from '../services/api';
import { parseJsonArray } from '../utils/parseJsonArray';
import HighlightedDocument from '../components/HighlightedDocument';
import ChatPanel, { type ChatPanelHandle } from '../components/ChatPanel';
import FeedbackPDF from '../components/FeedbackPDF';

const SESSION_KEY = 'fl_student_session';
const draftKey = (code: string, studentId: string) => `fl_portal_draft_${code}_${studentId}`;

type WorkspaceState = 'loading' | 'no-submission' | 'processing' | 'ready' | 'error';

export default function StudentWorkspace() {
  const { code = '', studentId = '' } = useParams<{ code: string; studentId: string }>();
  const navigate = useNavigate();

  const [wsState, setWsState] = useState<WorkspaceState>('loading');
  const [data, setData] = useState<JoinSubmissionStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Resubmit (file upload) state
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitFile, setResubmitFile] = useState<File | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const [resubmitDone, setResubmitDone] = useState(false);

  // Feedback display
  const [activeTab, setActiveTab] = useState<'document' | 'criteria' | 'overall'>('overall');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  // 0 = Draft 1 (original), 1 = Draft 2 (first revision), 2 = Draft 3, …
  const [activeDraftIdx, setActiveDraftIdx] = useState(0);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  // ── Edit-in-Portal state ──────────────────────────────────────────────────
  const [editingMode, setEditingMode] = useState(false);
  const [draftText, setDraftText] = useState('');
  // explicitlySavedText tracks the last text the student explicitly saved;
  // isDirty is true whenever the current text diverges from that checkpoint.
  const [explicitlySavedText, setExplicitlySavedText] = useState('');
  const [saveFeedback, setSaveFeedback] = useState(false);   // "Saved ✓" indicator
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [submittingPortalDraft, setSubmittingPortalDraft] = useState(false);
  const [editorTab, setEditorTab] = useState<'edit' | 'overall' | 'criteria'>('edit');
  const [resolvedCommentIds, setResolvedCommentIds] = useState<Set<string>>(new Set());
  const [editorSelection, setEditorSelection] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isDirty = editingMode && draftText !== explicitlySavedText;

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatRef = useRef<ChatPanelHandle>(null);

  // Guard in-app navigation when there are unsaved changes
  const safeNavigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (isDirty && !window.confirm('You have unsaved changes in your draft. Leave anyway?')) return;
    navigate(to, opts);
  }, [isDirty, navigate]);

  // Block browser refresh / tab close when there are unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Auto-resize the textarea to its content so it never scrolls internally
  // (outer div scrolls instead), keeping the highlight overlay aligned.
  useEffect(() => {
    if (!editingMode || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.overflow = 'hidden';
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [draftText, editingMode]);

  // ── Session guard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) {
      navigate('/student', { replace: true });
      return;
    }
    fetchStatus();
  }, []);

  // Auto-scroll to active comment in both panes
  useEffect(() => {
    if (!activeCommentId) return;
    const t = setTimeout(() => {
      document.querySelector(`[data-highlight-id="${activeCommentId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.querySelector(`[data-comment-id="${activeCommentId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 30);
    return () => clearTimeout(t);
  }, [activeCommentId]);

  const fetchStatus = async (jumpToLatest = false) => {
    try {
      const result = await joinApi.getStudentSubmission(code, studentId);
      setData(result);
      if (jumpToLatest && result.submission) {
        setActiveDraftIdx(result.submission.revisions.length); // 0=original, so N revisions → idx N
      }
      if (!result.hasSubmission) {
        setWsState('no-submission');
      } else {
        const sub = result.submission!;
        // Status is driven by the newest draft (last revision if any, else the original)
        const allDrafts = [sub, ...sub.revisions];
        const newest = allDrafts[allDrafts.length - 1];
        const status = newest.status;
        if (status === 'processing' || status === 'pending') {
          setWsState('processing');
        } else if (status === 'ready' || status === 'reviewed') {
          setWsState('ready');
          if (sub.sectionFeedback) setExpandedSections(new Set(sub.sectionFeedback.map(s => s.id)));
        } else if (status === 'error') {
          setWsState('error');
        } else {
          setWsState('processing');
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load workspace');
      setWsState('error');
    }
  };

  // Poll while processing
  useEffect(() => {
    if (wsState === 'processing' && !pollingRef.current) {
      pollingRef.current = setInterval(async () => {
        try {
          const result = await joinApi.getStudentSubmission(code, studentId);
          setData(result);
          if (result.hasSubmission) {
            const sub = result.submission!;
            const allDrafts = [sub, ...sub.revisions];
            const newest = allDrafts[allDrafts.length - 1];
            if (newest.status !== 'processing' && newest.status !== 'pending') {
              clearInterval(pollingRef.current!);
              pollingRef.current = null;
              if (newest.status === 'ready' || newest.status === 'reviewed') {
                setWsState('ready');
                setActiveDraftIdx(allDrafts.length - 1);
                if (sub.sectionFeedback) setExpandedSections(new Set(sub.sectionFeedback.map(s => s.id)));
              } else {
                setWsState('error');
              }
            }
          }
        } catch { /* keep polling */ }
      }, 3000);
    } else if (wsState !== 'processing' && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [wsState]);

  // ── Upload handlers ───────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      await joinApi.submitFile(code, studentId, uploadFile);
      setUploadFile(null);
      setWsState('processing');
      await fetchStatus();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload');
    } finally {
      setUploading(false);
    }
  };

  const handleResubmit = async () => {
    if (!resubmitFile) return;
    setResubmitting(true);
    setResubmitError(null);
    try {
      await joinApi.resubmit(code, studentId, resubmitFile);
      setResubmitDone(true);
      setResubmitFile(null);
      setWsState('processing');
      await fetchStatus(true);
    } catch (err) {
      setResubmitError(err instanceof Error ? err.message : 'Failed to submit revision');
    } finally {
      setResubmitting(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(true); }, []);
  const handleDragLeave = useCallback(() => setDragActive(false), []);
  const handleDrop = useCallback((e: React.DragEvent, setter: (f: File) => void) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) setter(file);
  }, []);

  // ── Edit-in-Portal handlers ───────────────────────────────────────────────
  const enterEditMode = () => {
    // Always seed from the most recent ready draft (last in the drafts array).
    const latestReadyDraft = drafts.slice().reverse().find(
      (d): d is DraftRevision => d.status === 'ready' || d.status === 'reviewed'
    );
    const baseText = latestReadyDraft?.extractedText || '';
    const saved = localStorage.getItem(draftKey(code, studentId));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { text: string; savedAt: string };
        if (parsed.text !== baseText) {
          // There's a saved draft that differs from the base — offer to restore
          setShowRestoreBanner(true);
          setDraftText(parsed.text);
          setExplicitlySavedText(parsed.text);
        } else {
          setDraftText(baseText);
          setExplicitlySavedText(baseText);
        }
      } catch {
        setDraftText(baseText);
        setExplicitlySavedText(baseText);
      }
    } else {
      setDraftText(baseText);
      setExplicitlySavedText(baseText);
    }
    setEditorTab('edit');
    setResolvedCommentIds(new Set());
    setEditingMode(true);
  };

  const exitEditMode = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Leave the editor?')) return;
    setEditingMode(false);
    setShowRestoreBanner(false);
    setResolvedCommentIds(new Set());
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
  };

  const saveDraft = () => {
    localStorage.setItem(draftKey(code, studentId), JSON.stringify({ text: draftText, savedAt: new Date().toISOString() }));
    setExplicitlySavedText(draftText);
    setSaveFeedback(true);
    setTimeout(() => setSaveFeedback(false), 2000);
  };

  const handleDraftTextChange = (text: string) => {
    setDraftText(text);
    // Auto-save to localStorage silently (debounced 2s) as crash safety net
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      localStorage.setItem(draftKey(code, studentId), JSON.stringify({ text, savedAt: new Date().toISOString() }));
    }, 2000);
  };

  const startFresh = () => {
    const latestReadyDraft = drafts.slice().reverse().find(
      (d): d is DraftRevision => d.status === 'ready' || d.status === 'reviewed'
    );
    const baseText = latestReadyDraft?.extractedText || '';
    setDraftText(baseText);
    setExplicitlySavedText(baseText);
    setResolvedCommentIds(new Set());
    setShowRestoreBanner(false);
    localStorage.removeItem(draftKey(code, studentId));
  };

  const handlePortalSubmit = async () => {
    if (!draftText.trim()) return;
    setSubmittingPortalDraft(true);
    try {
      const file = new File([draftText], 'portal-draft.txt', { type: 'text/plain' });
      await joinApi.resubmit(code, studentId, file);
      // Clear saved draft since it's been submitted
      localStorage.removeItem(draftKey(code, studentId));
      setEditingMode(false);
      setShowRestoreBanner(false);
      setResolvedCommentIds(new Set());
      setWsState('processing');
      await fetchStatus(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit draft');
    } finally {
      setSubmittingPortalDraft(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCommentClick = (id: string) => setActiveCommentId(prev => prev === id ? null : id);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

  // Chat helpers
  const askAboutInlineComment = (comment: { highlightedText: string; comment: string; criterion?: { name: string } }) => {
    const criterionPart = comment.criterion ? ` (${comment.criterion.name})` : '';
    chatRef.current?.sendMessage(
      `Can you explain this comment${criterionPart}? The highlighted text was: "${comment.highlightedText}" and the feedback was: "${comment.comment}"`
    );
  };

  const askAboutCriterion = (criterionName: string, type: 'strengths' | 'growth' | 'suggestions', items: string[]) => {
    const label = type === 'strengths' ? 'strengths' : type === 'growth' ? 'areas for growth' : 'suggestions';
    chatRef.current?.sendMessage(
      `Can you explain more about the ${label} for "${criterionName}"? The feedback mentioned: ${items.join('; ')}`
    );
  };

  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const text = draftText.slice(el.selectionStart, el.selectionEnd);
    setEditorSelection(text.length > 10 ? text : null);
  };

  // Sends selected passage + full current draft as context so the AI can
  // give specific advice on the excerpt while understanding the whole essay.
  const askAboutSelection = () => {
    if (!editorSelection) return;
    const msg =
      `I'm revising my essay and want feedback on a specific passage.\n\n` +
      `Selected passage:\n"${editorSelection}"\n\n` +
      `Full current draft for context:\n---\n${draftText}\n---\n\n` +
      `Based on the rubric criteria and the feedback you gave me, what specific, actionable changes would improve the selected passage?`;
    chatRef.current?.sendMessage(msg);
    setEditorSelection(null);
  };

  const askAboutOverall = (section: 'summary' | 'improvements' | 'nextSteps', content: string | string[]) => {
    const contentStr = Array.isArray(content) ? content.join('; ') : content;
    const label = section === 'summary' ? 'summary' : section === 'improvements' ? 'priority improvements' : 'next steps';
    chatRef.current?.sendMessage(`Can you explain more about the ${label}? It said: "${contentStr}"`);
  };

  // Derived display data
  // drafts[0] = original submission, drafts[1..] = revisions oldest-first
  const drafts = useMemo((): DraftRevision[] => {
    if (!data?.submission) return [];
    const sub = data.submission;
    const orig: DraftRevision = {
      id: sub.id,
      status: sub.status,
      fileName: sub.fileName,
      submittedAt: sub.submittedAt,
      extractedText: sub.extractedText,
      inlineComments: sub.inlineComments,
      sectionFeedback: sub.sectionFeedback,
      overallFeedback: sub.overallFeedback,
    };
    return [orig, ...sub.revisions];
  }, [data]);

  const displaySub = useMemo((): DraftRevision | null => {
    if (drafts.length === 0) return null;
    return drafts[Math.min(activeDraftIdx, drafts.length - 1)] ?? null;
  }, [drafts, activeDraftIdx]);

  const sortedComments = useMemo(() => {
    if (!displaySub?.inlineComments) return [];
    return [...displaySub.inlineComments].sort((a, b) => a.startPosition - b.startPosition);
  }, [displaySub]);

  // Pre-parsed overall feedback lists — avoids repeated JSON.parse on every render.
  const overallParsed = useMemo(() => {
    if (!displaySub?.overallFeedback) return null;
    return {
      improvements: parseJsonArray(displaySub.overallFeedback.priorityImprovements),
      nextSteps: parseJsonArray(displaySub.overallFeedback.nextSteps),
    };
  }, [displaySub]);

  // Compute highlight ranges for the editor overlay. Searches for each unresolved
  // comment's highlighted text in the current draft, merges overlapping ranges.
  const editorHighlightSegments = useMemo(() => {
    if (!editingMode || sortedComments.length === 0) return null;
    type Seg = { text: string; highlighted: boolean };
    const ranges: { start: number; end: number }[] = [];
    for (const c of sortedComments) {
      if (resolvedCommentIds.has(c.id)) continue;
      // Prefer the original anchored position if the text hasn't moved
      if (draftText.slice(c.startPosition, c.endPosition) === c.highlightedText) {
        ranges.push({ start: c.startPosition, end: c.endPosition });
      } else {
        // Fall back to first occurrence search after editing
        const idx = draftText.indexOf(c.highlightedText);
        if (idx !== -1) ranges.push({ start: idx, end: idx + c.highlightedText.length });
      }
    }
    if (ranges.length === 0) return null;
    ranges.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const r of ranges) {
      if (merged.length && r.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, r.end);
      } else {
        merged.push({ ...r });
      }
    }
    const segs: Seg[] = [];
    let cursor = 0;
    for (const r of merged) {
      if (r.start > cursor) segs.push({ text: draftText.slice(cursor, r.start), highlighted: false });
      segs.push({ text: draftText.slice(r.start, r.end), highlighted: true });
      cursor = r.end;
    }
    if (cursor < draftText.length) segs.push({ text: draftText.slice(cursor), highlighted: false });
    return segs;
  }, [editingMode, draftText, sortedComments, resolvedCommentIds]);

  const assignmentName = data?.assignmentName || 'Assignment';
  const studentName = data?.studentName || '';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-sidebar border-b border-white/10 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-accent-400" />
          <span className="text-white font-serif font-semibold">FeedbackLab</span>
        </div>
        <div className="h-5 w-px bg-white/20" />
        <div className="flex-1 min-w-0">
          <p className="text-white/90 font-medium truncate">{assignmentName}</p>
          {studentName && <p className="text-white/50 text-sm truncate">{studentName}</p>}
        </div>
        {!editingMode && (
          <button
            onClick={() => safeNavigate(`/student/${code}`)}
            className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}
      </header>

      {/* Edit-in-Portal view */}
      {editingMode && displaySub ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Editor toolbar */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <button
              onClick={exitEditMode}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Feedback
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <span className="text-sm font-medium text-gray-700 flex-1">
              Editing Draft {drafts.length + 1}
              {isDirty && <span className="ml-2 text-xs text-amber-500 font-normal">• unsaved changes</span>}
            </span>
            {editorTab === 'edit' && (
              <span className="text-xs text-gray-400 hidden sm:block">
                {wordCount(draftText).toLocaleString()} words
              </span>
            )}
            <button
              onClick={saveDraft}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                saveFeedback
                  ? 'bg-green-100 text-green-700'
                  : isDirty
                  ? 'bg-forest-600 text-white hover:bg-forest-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {saveFeedback ? (
                <><CheckCircle className="w-4 h-4" /> Saved</>
              ) : (
                <><Save className="w-4 h-4" /> Save</>
              )}
            </button>
            <button
              onClick={handlePortalSubmit}
              disabled={submittingPortalDraft || !draftText.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white rounded-lg text-sm font-medium hover:bg-forest-700 disabled:opacity-50"
            >
              {submittingPortalDraft
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                : <><Upload className="w-4 h-4" /> Submit for Feedback</>
              }
            </button>
          </div>

          {/* Editor tab bar */}
          <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
            {([
              { id: 'edit' as const, label: 'Edit Essay' },
              { id: 'overall' as const, label: 'Overall Feedback' },
              { id: 'criteria' as const, label: 'By Criteria' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setEditorTab(id); setEditorSelection(null); }}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  editorTab === id
                    ? 'border-forest-600 text-forest-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Restore banner */}
          {showRestoreBanner && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-sm flex-shrink-0">
              <RotateCcw className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span className="text-amber-800 flex-1">We found a saved draft — continuing from where you left off.</span>
              <button onClick={startFresh} className="text-amber-700 underline hover:text-amber-900">
                Start fresh from original
              </button>
              <button onClick={() => setShowRestoreBanner(false)} className="text-amber-500 hover:text-amber-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Edit tab — split pane */}
          {editorTab === 'edit' && (
            <div className="flex flex-1 overflow-hidden">
              {/* Textarea with highlight overlay */}
              <div className="flex-1 overflow-auto bg-gray-50 p-4">
                {/*
                  Grid stacking: overlay and textarea share the same grid cell so
                  they're identical in size and position. The overlay renders
                  transparent text with yellow backgrounds on highlighted passages;
                  the textarea sits on top with bg-transparent so the highlights
                  show through.
                */}
                <div className="grid w-full" style={{ gridTemplateColumns: '1fr' }}>
                  {/* Highlight overlay — behind the textarea */}
                  <div
                    aria-hidden
                    style={{ gridArea: '1 / 1' }}
                    className="px-5 py-4 bg-white border border-transparent rounded-xl text-sm leading-relaxed font-serif whitespace-pre-wrap break-words pointer-events-none select-none text-transparent min-h-[500px]"
                  >
                    {editorHighlightSegments
                      ? editorHighlightSegments.map((seg, i) =>
                          seg.highlighted
                            ? <mark key={i} className="bg-yellow-200 rounded-sm" style={{ color: 'transparent' }}>{seg.text}</mark>
                            : <span key={i}>{seg.text}</span>
                        )
                      : draftText
                    }
                  </div>
                  {/* Editable textarea — on top */}
                  <textarea
                    ref={textareaRef}
                    value={draftText}
                    onChange={(e) => handleDraftTextChange(e.target.value)}
                    onSelect={handleTextareaSelect}
                    onMouseUp={handleTextareaSelect}
                    style={{ gridArea: '1 / 1', background: editorHighlightSegments ? 'transparent' : 'white' }}
                    className="w-full px-5 py-4 border border-gray-200 rounded-xl text-gray-800 text-sm leading-relaxed font-serif resize-none focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent min-h-[500px]"
                    placeholder="Start writing your revised essay…"
                    spellCheck
                  />
                </div>
              </div>

              {/* Comments sidebar */}
              <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Inline Comments{' '}
                    <span className="font-normal text-gray-400">
                      ({sortedComments.filter(c => !resolvedCommentIds.has(c.id)).length} open)
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Click Resolve to dismiss a comment.</p>
                </div>

                {/* Selection → Ask AI card */}
                {editorSelection && (
                  <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 flex-shrink-0">
                    <p className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> Selected passage
                    </p>
                    <p className="text-xs text-gray-600 italic line-clamp-3 mb-2">
                      "{editorSelection.slice(0, 120)}{editorSelection.length > 120 ? '…' : ''}"
                    </p>
                    <button
                      onClick={askAboutSelection}
                      className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                    >
                      <Bot className="w-3 h-3" /> Ask AI about this passage
                    </button>
                    <p className="text-xs text-blue-500 text-center mt-1">Full draft sent as context</p>
                  </div>
                )}
                <div className="flex-1 overflow-auto p-3 space-y-2">
                  {sortedComments.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">No inline comments for this draft.</p>
                  )}
                  {sortedComments.map((comment, idx) => {
                    const resolved = resolvedCommentIds.has(comment.id);
                    return (
                      <div
                        key={comment.id}
                        className={`rounded-lg p-3 border transition-all ${
                          resolved
                            ? 'opacity-40 border-gray-200 bg-gray-50'
                            : 'border-yellow-200 bg-yellow-50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`flex-shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium ${
                            resolved ? 'bg-gray-200 text-gray-500' : 'bg-yellow-400 text-yellow-900'
                          }`}>
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            {comment.criterion && (
                              <p className={`text-xs font-medium mb-1 ${resolved ? 'text-gray-400' : 'text-yellow-700'}`}>
                                {comment.criterion.name}
                              </p>
                            )}
                            <p className={`text-xs mb-1 italic line-clamp-2 ${resolved ? 'text-gray-400' : 'text-gray-500'}`}>
                              "{comment.highlightedText.slice(0, 60)}{comment.highlightedText.length > 60 ? '…' : ''}"
                            </p>
                            <p className={`text-sm ${resolved ? 'text-gray-400' : 'text-gray-700'}`}>{comment.comment}</p>
                            <div className="flex items-center justify-between mt-2">
                              {resolved
                                ? <span className="text-xs text-green-600 font-medium">Resolved ✓</span>
                                : <span />
                              }
                              <button
                                onClick={() => setResolvedCommentIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(comment.id)) next.delete(comment.id);
                                  else next.add(comment.id);
                                  return next;
                                })}
                                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                  resolved
                                    ? 'text-gray-500 border-gray-300 hover:bg-gray-100'
                                    : 'text-yellow-700 border-yellow-300 hover:bg-yellow-100'
                                }`}
                              >
                                {resolved ? 'Unresolve' : 'Resolve'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Overall tab — read-only */}
          {editorTab === 'overall' && (
            <div className="flex-1 overflow-auto p-6">
              {!displaySub.overallFeedback || !overallParsed ? (
                <div className="text-center py-16 text-gray-400">No overall feedback available.</div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <p className="text-gray-800 leading-relaxed">{displaySub.overallFeedback.summary}</p>
                  </div>
                  {overallParsed.improvements.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                      <h3 className="font-semibold text-amber-900 flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4" /> Priority Improvements
                      </h3>
                      <ol className="space-y-2">
                        {overallParsed.improvements.map((item, i) => (
                          <li key={i} className="flex gap-3 text-sm text-amber-800">
                            <span className="font-bold text-amber-500 flex-shrink-0">{i + 1}.</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {overallParsed.nextSteps.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                      <h3 className="font-semibold text-blue-900 flex items-center gap-2 mb-3">
                        <Lightbulb className="w-4 h-4" /> Next Steps
                      </h3>
                      <ol className="space-y-2">
                        {overallParsed.nextSteps.map((item, i) => (
                          <li key={i} className="flex gap-3 text-sm text-blue-800">
                            <span className="font-bold text-blue-400 flex-shrink-0">{i + 1}.</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {displaySub.overallFeedback.encouragement && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-green-800 text-sm italic">{displaySub.overallFeedback.encouragement}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Criteria tab — read-only */}
          {editorTab === 'criteria' && (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-3xl mx-auto space-y-3">
                {displaySub.sectionFeedback.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">No criteria feedback available.</div>
                ) : displaySub.sectionFeedback.map((section) => {
                  const strengths = parseJsonArray(section.strengths);
                  const areasForGrowth = parseJsonArray(section.areasForGrowth);
                  const suggestions = parseJsonArray(section.suggestions);
                  return (
                    <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                      >
                        <span className="font-semibold text-gray-900">{section.criterion.name}</span>
                        {expandedSections.has(section.id)
                          ? <ChevronDown className="w-5 h-5 text-gray-400" />
                          : <ChevronRight className="w-5 h-5 text-gray-400" />
                        }
                      </button>
                      {expandedSections.has(section.id) && (
                        <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                          {strengths.length > 0 && (
                            <div className="bg-green-50 rounded-lg p-4 mt-4">
                              <h4 className="text-sm font-medium text-green-800 flex items-center gap-1 mb-2">
                                <CheckCircle className="w-4 h-4" /> Strengths
                              </h4>
                              <ul className="space-y-1">
                                {strengths.map((s, i) => (
                                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-green-500 mt-0.5">•</span>{s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {areasForGrowth.length > 0 && (
                            <div className="bg-amber-50 rounded-lg p-4">
                              <h4 className="text-sm font-medium text-amber-800 flex items-center gap-1 mb-2">
                                <TrendingUp className="w-4 h-4" /> Areas for Growth
                              </h4>
                              <ul className="space-y-1">
                                {areasForGrowth.map((s, i) => (
                                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">•</span>{s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {suggestions.length > 0 && (
                            <div className="bg-blue-50 rounded-lg p-4">
                              <h4 className="text-sm font-medium text-blue-800 flex items-center gap-1 mb-2">
                                <Lightbulb className="w-4 h-4" /> Suggestions
                              </h4>
                              <ul className="space-y-1">
                                {suggestions.map((s, i) => (
                                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>{s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Normal feedback / upload view */
        <main className="max-w-5xl mx-auto px-4 py-8 w-full">

          {wsState === 'loading' && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
            </div>
          )}

          {wsState === 'error' && (
            <div className="bg-white rounded-xl border border-red-200 p-10 text-center max-w-md mx-auto">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
              <p className="text-gray-500 text-sm mb-4">{loadError || 'An error occurred while generating your feedback.'}</p>
              <p className="text-gray-400 text-sm">Contact your teacher if the problem persists.</p>
            </div>
          )}

          {wsState === 'no-submission' && (
            <div className="max-w-lg mx-auto">
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-1">Submit your work</h2>
                <p className="text-sm text-gray-500 mb-6">Upload your essay or document to receive AI feedback.</p>

                <div
                  className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors mb-4 ${
                    dragActive ? 'border-forest-400 bg-forest-50' : 'border-gray-300 bg-gray-50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, setUploadFile)}
                >
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-1">
                    Drag & drop your file, or{' '}
                    <label className="text-forest-600 hover:text-forest-700 cursor-pointer underline">
                      browse
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.doc,.txt,.py,.java,.js,.ts,.cpp,.c,.html,.css,.md,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }}
                      />
                    </label>
                  </p>
                  <p className="text-xs text-gray-400">PDF, Word, text, code, or image files up to 50 MB</p>
                </div>

                {uploadFile && (
                  <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 mb-4">
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{uploadFile.name}</p>
                      <p className="text-xs text-gray-400">{formatSize(uploadFile.size)}</p>
                    </div>
                    <button onClick={() => setUploadFile(null)} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {uploadError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm mb-4">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {uploadError}
                  </div>
                )}

                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || uploading}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-forest-600 text-white rounded-xl font-medium hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                    : <><Upload className="w-4 h-4" /> Submit for Feedback</>
                  }
                </button>
              </div>
            </div>
          )}

          {wsState === 'processing' && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-full bg-forest-100 flex items-center justify-center mb-6">
                <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Generating your feedback…</h2>
              <p className="text-gray-500 text-sm max-w-sm">
                The AI is reading through your work and preparing personalised feedback. This usually takes about 30–60 seconds.
              </p>
            </div>
          )}

          {wsState === 'ready' && displaySub && data?.submission && (
            <div>
              {/* Draft selector — shown only when there's more than one draft */}
              {drafts.length > 1 && (
                <div className="flex gap-2 mb-6 flex-wrap">
                  {drafts.map((draft, idx) => (
                    <button
                      key={draft.id}
                      onClick={() => { setActiveDraftIdx(idx); setActiveCommentId(null); }}
                      disabled={draft.status === 'processing' || draft.status === 'pending'}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        activeDraftIdx === idx
                          ? 'bg-forest-600 text-white'
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      Draft {idx + 1}
                      {(draft.status === 'processing' || draft.status === 'pending') && (
                        <Loader2 className="w-3 h-3 animate-spin inline ml-1.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* File name + PDF export */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <FileText className="w-4 h-4" />
                  <span>{displaySub.fileName}</span>
                </div>
                {displaySub.overallFeedback && (
                  <PDFDownloadLink
                    document={
                      <FeedbackPDF
                        studentName={studentName}
                        assignmentName={assignmentName}
                        fileName={displaySub.fileName}
                        overallFeedback={displaySub.overallFeedback}
                        sectionFeedback={displaySub.sectionFeedback}
                        inlineComments={displaySub.inlineComments}
                        extractedText={displaySub.extractedText}
                      />
                    }
                    fileName={`feedback-${studentName.replace(/\s+/g, '-') || 'student'}-${assignmentName.replace(/\s+/g, '-') || 'assignment'}-draft${activeDraftIdx + 1}.pdf`}
                  >
                    {({ loading: pdfLoading }) => (
                      <button
                        className="flex items-center gap-2 px-3 py-1.5 bg-forest-600 text-white rounded-lg hover:bg-forest-700 text-sm font-medium disabled:opacity-60"
                        disabled={pdfLoading}
                      >
                        {pdfLoading
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
                          : <><Download className="w-4 h-4" /> Export PDF</>
                        }
                      </button>
                    )}
                  </PDFDownloadLink>
                )}
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-200 mb-6 bg-white rounded-t-xl">
                {(['overall', 'criteria', 'document'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-3 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                      activeTab === tab
                        ? 'border-forest-600 text-forest-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab === 'criteria' ? 'By Criteria' : tab === 'document' ? `Inline Comments (${sortedComments.length})` : 'Overall'}
                  </button>
                ))}
              </div>

              {/* Overall tab */}
              {activeTab === 'overall' && displaySub.overallFeedback && overallParsed && (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-gray-800 leading-relaxed flex-1">{displaySub.overallFeedback.summary}</p>
                      <button
                        onClick={() => askAboutOverall('summary', displaySub.overallFeedback!.summary)}
                        className="flex-shrink-0 flex items-center gap-1 text-xs text-forest-600 hover:bg-forest-50 px-2 py-1 rounded"
                      >
                        <Bot className="w-3 h-3" /> Ask
                      </button>
                    </div>
                  </div>

                  {overallParsed.improvements.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4" /> Priority Improvements
                        </h3>
                        <button
                          onClick={() => askAboutOverall('improvements', overallParsed.improvements)}
                          className="flex-shrink-0 flex items-center gap-1 text-xs text-amber-700 hover:bg-amber-100 px-2 py-1 rounded"
                        >
                          <Bot className="w-3 h-3" /> Ask
                        </button>
                      </div>
                      <ol className="space-y-2">
                        {overallParsed.improvements.map((item, i) => (
                          <li key={i} className="flex gap-3 text-sm text-amber-800">
                            <span className="font-bold text-amber-500 flex-shrink-0">{i + 1}.</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {overallParsed.nextSteps.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                          <Lightbulb className="w-4 h-4" /> Next Steps
                        </h3>
                        <button
                          onClick={() => askAboutOverall('nextSteps', overallParsed.nextSteps)}
                          className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-700 hover:bg-blue-100 px-2 py-1 rounded"
                        >
                          <Bot className="w-3 h-3" /> Ask
                        </button>
                      </div>
                      <ol className="space-y-2">
                        {overallParsed.nextSteps.map((item, i) => (
                          <li key={i} className="flex gap-3 text-sm text-blue-800">
                            <span className="font-bold text-blue-400 flex-shrink-0">{i + 1}.</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {displaySub.overallFeedback.encouragement && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-green-800 text-sm italic">{displaySub.overallFeedback.encouragement}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Criteria tab */}
              {activeTab === 'criteria' && (
                <div className="space-y-3">
                  {displaySub.sectionFeedback.map((section) => {
                    const strengths = parseJsonArray(section.strengths);
                    const areasForGrowth = parseJsonArray(section.areasForGrowth);
                    const suggestions = parseJsonArray(section.suggestions);
                    return (
                      <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <button
                          onClick={() => toggleSection(section.id)}
                          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                        >
                          <span className="font-semibold text-gray-900">{section.criterion.name}</span>
                          {expandedSections.has(section.id) ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        {expandedSections.has(section.id) && (
                          <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                            {strengths.length > 0 && (
                              <div className="bg-green-50 rounded-lg p-4 mt-4">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-green-800 flex items-center gap-1">
                                    <CheckCircle className="w-4 h-4" /> Strengths
                                  </h4>
                                  <button onClick={() => askAboutCriterion(section.criterion.name, 'strengths', strengths)} className="flex items-center gap-1 text-xs text-green-700 hover:bg-green-100 px-1.5 py-0.5 rounded">
                                    <Bot className="w-3 h-3" /> Ask
                                  </button>
                                </div>
                                <ul className="space-y-1">
                                  {strengths.map((s, i) => <li key={i} className="text-sm text-gray-700 flex items-start gap-2"><span className="text-green-500 mt-0.5">•</span>{s}</li>)}
                                </ul>
                              </div>
                            )}
                            {areasForGrowth.length > 0 && (
                              <div className="bg-amber-50 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-amber-800 flex items-center gap-1">
                                    <TrendingUp className="w-4 h-4" /> Areas for Growth
                                  </h4>
                                  <button onClick={() => askAboutCriterion(section.criterion.name, 'growth', areasForGrowth)} className="flex items-center gap-1 text-xs text-amber-700 hover:bg-amber-100 px-1.5 py-0.5 rounded">
                                    <Bot className="w-3 h-3" /> Ask
                                  </button>
                                </div>
                                <ul className="space-y-1">
                                  {areasForGrowth.map((s, i) => <li key={i} className="text-sm text-gray-700 flex items-start gap-2"><span className="text-amber-500 mt-0.5">•</span>{s}</li>)}
                                </ul>
                              </div>
                            )}
                            {suggestions.length > 0 && (
                              <div className="bg-blue-50 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-blue-800 flex items-center gap-1">
                                    <Lightbulb className="w-4 h-4" /> Suggestions
                                  </h4>
                                  <button onClick={() => askAboutCriterion(section.criterion.name, 'suggestions', suggestions)} className="flex items-center gap-1 text-xs text-blue-700 hover:bg-blue-100 px-1.5 py-0.5 rounded">
                                    <Bot className="w-3 h-3" /> Ask
                                  </button>
                                </div>
                                <ul className="space-y-1">
                                  {suggestions.map((s, i) => <li key={i} className="text-sm text-gray-700 flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span>{s}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Document tab */}
              {activeTab === 'document' && displaySub.extractedText && (
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  {sortedComments.length === 0 ? (
                    <div className="bg-gray-50 rounded-lg p-4 overflow-auto" style={{ maxHeight: '60vh' }}>
                      <HighlightedDocument text={displaySub.extractedText} comments={[]} activeCommentId={null} onCommentClick={() => {}} />
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <div className="flex-1 bg-gray-50 rounded-lg p-4 overflow-auto" style={{ maxHeight: '60vh' }}>
                        <HighlightedDocument
                          text={displaySub.extractedText}
                          comments={sortedComments}
                          activeCommentId={activeCommentId}
                          onCommentClick={handleCommentClick}
                        />
                      </div>
                      <div className="w-72 flex-shrink-0 flex flex-col" style={{ maxHeight: '60vh' }}>
                        <h3 className="text-sm font-medium text-gray-700 pb-2 flex-shrink-0">
                          Inline Comments ({sortedComments.length})
                        </h3>
                        <div className="space-y-2 overflow-auto flex-1">
                          {sortedComments.map((comment, idx) => (
                            <div
                              key={comment.id}
                              data-comment-id={comment.id}
                              onClick={() => handleCommentClick(comment.id)}
                              className={`rounded-lg p-3 cursor-pointer transition-colors ${
                                activeCommentId === comment.id
                                  ? 'bg-yellow-200 border-2 border-yellow-500'
                                  : 'bg-yellow-50 border border-yellow-200 hover:bg-yellow-100'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className="flex-shrink-0 w-5 h-5 bg-yellow-400 text-yellow-900 rounded-full text-xs flex items-center justify-center font-medium">
                                  {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  {comment.criterion && (
                                    <p className="text-xs font-medium text-yellow-700 mb-1">{comment.criterion.name}</p>
                                  )}
                                  <p className="text-xs text-gray-600 mb-1 italic line-clamp-2">
                                    "{comment.highlightedText.slice(0, 60)}{comment.highlightedText.length > 60 ? '…' : ''}"
                                  </p>
                                  <p className="text-sm text-gray-800">{comment.comment}</p>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); askAboutInlineComment(comment); }}
                                    className="mt-2 flex items-center gap-1 text-xs text-yellow-700 hover:bg-yellow-100 px-1.5 py-0.5 rounded"
                                  >
                                    <Bot className="w-3 h-3" /> Ask about this
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Revision options */}
              <div className="mt-8 space-y-3">
                {/* Edit in Portal */}
                {displaySub.extractedText && (
                  <div className="bg-white rounded-xl border border-forest-200 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-gray-900 flex items-center gap-2">
                          <Edit3 className="w-5 h-5 text-forest-600" />
                          Edit in Portal
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Revise your essay directly here with inline comments as a guide. Draft is auto-saved as you type.
                        </p>
                      </div>
                      <button
                        onClick={enterEditMode}
                        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 text-sm font-medium"
                      >
                        <Edit3 className="w-4 h-4" />
                        {localStorage.getItem(draftKey(code, studentId)) ? 'Resume Next Draft' : 'Start Next Draft'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload revision (collapsible) */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setResubmitOpen(!resubmitOpen)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
                  >
                    <div className="flex items-center gap-2 text-gray-700">
                      <Upload className="w-5 h-5" />
                      <span className="font-medium">Upload Revised File</span>
                    </div>
                    {resubmitOpen
                      ? <ChevronDown className="w-5 h-5 text-gray-400" />
                      : <ChevronRight className="w-5 h-5 text-gray-400" />
                    }
                  </button>

                  {resubmitOpen && (
                    <div className="px-5 pb-5 border-t border-gray-100 space-y-4 pt-4">
                      <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        Upload a revised file from your own editor — you'll receive updated feedback comparing both drafts.
                      </p>

                      {resubmitDone ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-green-900">Revision submitted! Generating feedback…</p>
                        </div>
                      ) : (
                        <>
                          <div
                            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                              dragActive ? 'border-forest-400 bg-forest-50' : 'border-gray-300 bg-gray-50'
                            }`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, setResubmitFile)}
                          >
                            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">
                              Drag & drop, or{' '}
                              <label className="text-forest-600 cursor-pointer underline">
                                browse
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".pdf,.docx,.doc,.txt,.py,.java,.js,.ts,.cpp,.c,.html,.css,.md,.png,.jpg,.jpeg,.webp"
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) setResubmitFile(f); }}
                                />
                              </label>
                            </p>
                          </div>

                          {resubmitFile && (
                            <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700 flex-1 truncate">{resubmitFile.name}</span>
                              <button onClick={() => setResubmitFile(null)} className="text-gray-400 hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          {resubmitError && <p className="text-sm text-red-600">{resubmitError}</p>}

                          <button
                            onClick={handleResubmit}
                            disabled={!resubmitFile || resubmitting}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-forest-600 text-white rounded-xl text-sm hover:bg-forest-700 disabled:opacity-50"
                          >
                            {resubmitting
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                              : <><Upload className="w-4 h-4" /> Submit Revision</>
                            }
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* Floating AI chat — available whenever feedback is ready */}
      {wsState === 'ready' && (
        <ChatPanel
          ref={chatRef}
          onChat={(msg, hist) => joinApi.chat(code, studentId, msg, hist).then(r => r.response)}
        />
      )}
    </div>
  );
}
