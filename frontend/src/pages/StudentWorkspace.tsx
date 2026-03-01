/**
 * StudentWorkspace — Student's submission and feedback page
 *
 * Fetched via join code + studentId (no magic link). States:
 *   no-submission → upload form
 *   processing     → polling spinner
 *   ready          → tabbed feedback display + resubmit section
 *   error          → error card
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MessageSquare, Loader2, AlertCircle, Upload, FileText, Trash2,
  CheckCircle, ChevronDown, ChevronRight, TrendingUp, Lightbulb,
  ArrowLeft, Bot, Download
} from 'lucide-react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { joinApi, type JoinSubmissionStatus } from '../services/api';
import { parseJsonArray } from '../utils/parseJsonArray';
import HighlightedDocument from '../components/HighlightedDocument';
import ChatPanel, { type ChatPanelHandle } from '../components/ChatPanel';
import FeedbackPDF from '../components/FeedbackPDF';

const SESSION_KEY = 'fl_student_session';

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

  // Resubmit state
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitFile, setResubmitFile] = useState<File | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const [resubmitDone, setResubmitDone] = useState(false);

  // Feedback display
  const [activeTab, setActiveTab] = useState<'document' | 'criteria' | 'overall'>('overall');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeDraft, setActiveDraft] = useState<'original' | 'revision'>('original');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatRef = useRef<ChatPanelHandle>(null);

  // Guard: no session → back to portal
  useEffect(() => {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) {
      navigate('/student', { replace: true });
      return;
    }
    fetchStatus();
  }, []);

  // Scroll to active comment in both document and sidebar
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

  const fetchStatus = async () => {
    try {
      const result = await joinApi.getStudentSubmission(code, studentId);
      setData(result);
      if (!result.hasSubmission) {
        setWsState('no-submission');
      } else {
        const sub = result.submission!;
        const activeSubmission = sub.latestRevision ?? sub;
        const status = activeSubmission.status;
        if (status === 'processing' || status === 'pending') {
          setWsState('processing');
        } else if (status === 'ready' || status === 'reviewed') {
          setWsState('ready');
          if (sub.sectionFeedback) {
            setExpandedSections(new Set(sub.sectionFeedback.map(s => s.id)));
          }
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
            const active = sub.latestRevision ?? sub;
            if (active.status !== 'processing' && active.status !== 'pending') {
              clearInterval(pollingRef.current!);
              pollingRef.current = null;
              if (active.status === 'ready' || active.status === 'reviewed') {
                setWsState('ready');
                if (sub.sectionFeedback) {
                  setExpandedSections(new Set(sub.sectionFeedback.map(s => s.id)));
                }
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
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [wsState]);

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
      setActiveDraft('original');
      await fetchStatus();
    } catch (err) {
      setResubmitError(err instanceof Error ? err.message : 'Failed to submit revision');
    } finally {
      setResubmitting(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);
  const handleDragLeave = useCallback(() => setDragActive(false), []);
  const handleDrop = useCallback((e: React.DragEvent, setter: (f: File) => void) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) setter(file);
  }, []);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCommentClick = (id: string) => {
    setActiveCommentId(prev => prev === id ? null : id);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Chat helpers — pre-fill a message and send it to the chat panel
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

  const askAboutOverall = (section: 'summary' | 'improvements' | 'nextSteps', content: string | string[]) => {
    const contentStr = Array.isArray(content) ? content.join('; ') : content;
    const label = section === 'summary' ? 'summary' : section === 'improvements' ? 'priority improvements' : 'next steps';
    chatRef.current?.sendMessage(`Can you explain more about the ${label}? It said: "${contentStr}"`);
  };

  // Pick which submission to display in feedback tabs
  const displaySub = useMemo(() => {
    if (!data?.submission) return null;
    const sub = data.submission;
    if (activeDraft === 'revision' && sub.latestRevision && (sub.latestRevision.status === 'ready' || sub.latestRevision.status === 'reviewed')) {
      return sub.latestRevision;
    }
    return sub;
  }, [data, activeDraft]);

  const sortedComments = useMemo(() => {
    if (!displaySub?.inlineComments) return [];
    return [...displaySub.inlineComments].sort((a, b) => a.startPosition - b.startPosition);
  }, [displaySub]);

  const assignmentName = data?.assignmentName || 'Assignment';
  const studentName = data?.studentName || '';
  const hasRevision = data?.submission?.latestRevision !== null && data?.submission?.latestRevision !== undefined;
  const revisionReady = hasRevision && (data?.submission?.latestRevision?.status === 'ready' || data?.submission?.latestRevision?.status === 'reviewed');

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-sidebar border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-accent-400" />
          <span className="text-white font-serif font-semibold">FeedbackLab</span>
        </div>
        <div className="h-5 w-px bg-white/20" />
        <div className="flex-1 min-w-0">
          <p className="text-white/90 font-medium truncate">{assignmentName}</p>
          {studentName && <p className="text-white/50 text-sm truncate">{studentName}</p>}
        </div>
        <button
          onClick={() => navigate(`/student/${code}`)}
          className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Loading */}
        {wsState === 'loading' && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
          </div>
        )}

        {/* Error */}
        {wsState === 'error' && (
          <div className="bg-white rounded-xl border border-red-200 p-10 text-center max-w-md mx-auto">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-gray-500 text-sm mb-4">{loadError || 'An error occurred while generating your feedback.'}</p>
            <p className="text-gray-400 text-sm">Contact your teacher if the problem persists.</p>
          </div>
        )}

        {/* No submission — upload form */}
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
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Submit for Feedback</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Processing — spinner */}
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

        {/* Ready — feedback display */}
        {wsState === 'ready' && displaySub && data?.submission && (
          <div>
            {/* Draft toggle when revision exists */}
            {hasRevision && revisionReady && (
              <div className="flex gap-2 mb-6">
                {(['original', 'revision'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => { setActiveDraft(d); setActiveCommentId(null); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      activeDraft === d
                        ? 'bg-forest-600 text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {d === 'original' ? 'Original Draft' : 'Latest Revision'}
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
                  fileName={`feedback-${studentName.replace(/\s+/g, '-') || 'student'}-${assignmentName.replace(/\s+/g, '-') || 'assignment'}${activeDraft === 'revision' ? '-revised' : ''}.pdf`}
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
            {activeTab === 'overall' && displaySub.overallFeedback && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-gray-800 leading-relaxed flex-1">{displaySub.overallFeedback.summary}</p>
                    <button
                      onClick={() => askAboutOverall('summary', displaySub.overallFeedback!.summary)}
                      className="flex-shrink-0 flex items-center gap-1 text-xs text-forest-600 hover:text-forest-700 hover:bg-forest-50 px-2 py-1 rounded"
                    >
                      <Bot className="w-3 h-3" /> Ask
                    </button>
                  </div>
                </div>

                {parseJsonArray(displaySub.overallFeedback.priorityImprovements).length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Priority Improvements
                      </h3>
                      <button
                        onClick={() => askAboutOverall('improvements', parseJsonArray(displaySub.overallFeedback!.priorityImprovements))}
                        className="flex-shrink-0 flex items-center gap-1 text-xs text-amber-700 hover:bg-amber-100 px-2 py-1 rounded"
                      >
                        <Bot className="w-3 h-3" /> Ask
                      </button>
                    </div>
                    <ol className="space-y-2">
                      {parseJsonArray(displaySub.overallFeedback.priorityImprovements).map((item, i) => (
                        <li key={i} className="flex gap-3 text-sm text-amber-800">
                          <span className="font-bold text-amber-500 flex-shrink-0">{i + 1}.</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {parseJsonArray(displaySub.overallFeedback.nextSteps).length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                        <Lightbulb className="w-4 h-4" /> Next Steps
                      </h3>
                      <button
                        onClick={() => askAboutOverall('nextSteps', parseJsonArray(displaySub.overallFeedback!.nextSteps))}
                        className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-700 hover:bg-blue-100 px-2 py-1 rounded"
                      >
                        <Bot className="w-3 h-3" /> Ask
                      </button>
                    </div>
                    <ol className="space-y-2">
                      {parseJsonArray(displaySub.overallFeedback.nextSteps).map((item, i) => (
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
                                <button
                                  onClick={() => askAboutCriterion(section.criterion.name, 'strengths', strengths)}
                                  className="flex items-center gap-1 text-xs text-green-700 hover:bg-green-100 px-1.5 py-0.5 rounded"
                                >
                                  <Bot className="w-3 h-3" /> Ask
                                </button>
                              </div>
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
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-amber-800 flex items-center gap-1">
                                  <TrendingUp className="w-4 h-4" /> Areas for Growth
                                </h4>
                                <button
                                  onClick={() => askAboutCriterion(section.criterion.name, 'growth', areasForGrowth)}
                                  className="flex items-center gap-1 text-xs text-amber-700 hover:bg-amber-100 px-1.5 py-0.5 rounded"
                                >
                                  <Bot className="w-3 h-3" /> Ask
                                </button>
                              </div>
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
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-medium text-blue-800 flex items-center gap-1">
                                  <Lightbulb className="w-4 h-4" /> Suggestions
                                </h4>
                                <button
                                  onClick={() => askAboutCriterion(section.criterion.name, 'suggestions', suggestions)}
                                  className="flex items-center gap-1 text-xs text-blue-700 hover:bg-blue-100 px-1.5 py-0.5 rounded"
                                >
                                  <Bot className="w-3 h-3" /> Ask
                                </button>
                              </div>
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
            )}

            {/* Document tab — highlighted essay + comments sidebar */}
            {activeTab === 'document' && displaySub.extractedText && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                {sortedComments.length === 0 ? (
                  <div className="bg-gray-50 rounded-lg p-4 overflow-auto" style={{ maxHeight: '60vh' }}>
                    <HighlightedDocument
                      text={displaySub.extractedText}
                      comments={[]}
                      activeCommentId={null}
                      onCommentClick={() => {}}
                    />
                  </div>
                ) : (
                  <div className="flex gap-4">
                    {/* Highlighted document */}
                    <div className="flex-1 bg-gray-50 rounded-lg p-4 overflow-auto" style={{ maxHeight: '60vh' }}>
                      <HighlightedDocument
                        text={displaySub.extractedText}
                        comments={sortedComments}
                        activeCommentId={activeCommentId}
                        onCommentClick={handleCommentClick}
                      />
                    </div>

                    {/* Comments sidebar */}
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

            {/* Resubmit section */}
            <div className="mt-8 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setResubmitOpen(!resubmitOpen)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left"
              >
                <div className="flex items-center gap-2 text-gray-700">
                  <Upload className="w-5 h-5" />
                  <span className="font-medium">Submit a Revision</span>
                </div>
                {resubmitOpen ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {resubmitOpen && (
                <div className="px-5 pb-5 border-t border-gray-100 space-y-4 pt-4">
                  <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                    Upload a revised version — you'll receive updated feedback comparing your drafts.
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

                      {resubmitError && (
                        <p className="text-sm text-red-600">{resubmitError}</p>
                      )}

                      <button
                        onClick={handleResubmit}
                        disabled={!resubmitFile || resubmitting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-forest-600 text-white rounded-xl text-sm hover:bg-forest-700 disabled:opacity-50"
                      >
                        {resubmitting ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                        ) : (
                          <><Upload className="w-4 h-4" /> Submit Revision</>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating AI chat — only shown when feedback is ready */}
      {wsState === 'ready' && (
        <ChatPanel
          ref={chatRef}
          onChat={(msg, hist) => joinApi.chat(code, studentId, msg, hist).then(r => r.response)}
        />
      )}
    </div>
  );
}
