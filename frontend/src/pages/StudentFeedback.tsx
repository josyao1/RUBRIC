/**
 * StudentFeedback — Public student-facing feedback view
 *
 * Accessed via magic link token. Displays tabbed feedback with overall summary,
 * per-criteria scores, and a highlighted document view with inline comments.
 * Includes a ChatPanel for asking questions and a ResubmitPanel for revisions.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  MessageSquare, CheckCircle, TrendingUp, Lightbulb,
  ChevronDown, ChevronRight, Loader2, AlertCircle, FileText,
  Bot
} from 'lucide-react';
import { studentsApi, type SubmissionWithFeedback } from '../services/api';
import { parseJsonArray } from '../utils/parseJsonArray';
import HighlightedDocument from '../components/HighlightedDocument';
import ChatPanel, { type ChatPanelHandle } from '../components/ChatPanel';
import ResubmitPanel from '../components/ResubmitPanel';

interface FeedbackData extends SubmissionWithFeedback {
  studentName?: string;
  assignmentName?: string;
  extractedText?: string;
}

export default function StudentFeedback() {
  const { token } = useParams<{ token: string }>();
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'document' | 'criteria' | 'overall'>('overall');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Chat ref
  const chatRef = useRef<ChatPanelHandle>(null);

  useEffect(() => {
    if (token) {
      loadFeedback();
    }
  }, [token]);

  const loadFeedback = async () => {
    try {
      setLoading(true);
      const data = await studentsApi.getFeedback(token!);
      setFeedback(data);
      // Expand all sections by default
      if (data.sectionFeedback) {
        setExpandedSections(new Set(data.sectionFeedback.map((s: any) => s.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Feedback not found');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };


  // Ask about specific feedback (via chat ref)
  const askAboutInlineComment = (comment: { highlightedText: string; comment: string; criterion?: { name: string } }) => {
    const criterionPart = comment.criterion ? ` (${comment.criterion.name})` : '';
    const message = `Can you explain this comment${criterionPart}? The highlighted text was: "${comment.highlightedText}" and the feedback was: "${comment.comment}"`;
    chatRef.current?.sendMessage(message);
  };

  const askAboutCriterion = (criterionName: string, type: 'strengths' | 'growth' | 'suggestions', items: string[]) => {
    const typeLabel = type === 'strengths' ? 'strengths' : type === 'growth' ? 'areas for growth' : 'suggestions';
    const message = `Can you explain more about the ${typeLabel} for "${criterionName}"? The feedback mentioned: ${items.join('; ')}`;
    chatRef.current?.sendMessage(message);
  };

  const askAboutOverall = (section: 'summary' | 'improvements' | 'nextSteps', content: string | string[]) => {
    const contentStr = Array.isArray(content) ? content.join('; ') : content;
    const sectionLabel = section === 'summary' ? 'summary' : section === 'improvements' ? 'priority improvements' : 'next steps';
    const message = `Can you explain more about the ${sectionLabel}? It said: "${contentStr}"`;
    chatRef.current?.sendMessage(message);
  };

  const sortedComments = useMemo(() => {
    if (!feedback?.inlineComments) return [];
    return [...feedback.inlineComments].sort((a, b) => a.startPosition - b.startPosition);
  }, [feedback]);


  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-forest-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading your feedback...</p>
        </div>
      </div>
    );
  }

  if (error || !feedback) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 max-w-md text-center shadow-lg">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Feedback Not Found</h1>
          <p className="text-gray-600">{error || 'This feedback link may be invalid or expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-forest-100 rounded-lg">
              <MessageSquare className="w-6 h-6 text-forest-600" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-semibold text-gray-900">Your Feedback</h1>
              <p className="text-gray-500">from FeedbackLab</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            {feedback.studentName && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Student:</span>
                <span className="font-medium text-gray-900">{feedback.studentName}</span>
              </div>
            )}
            {feedback.assignmentName && (
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Assignment:</span>
                <span className="font-medium text-gray-900">{feedback.assignmentName}</span>
              </div>
            )}
            {feedback.fileName && (
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-gray-700">{feedback.fileName}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('overall')}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'overall'
                  ? 'border-forest-600 text-forest-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Overall Feedback
            </button>
            <button
              onClick={() => setActiveTab('criteria')}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'criteria'
                  ? 'border-forest-600 text-forest-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <CheckCircle className="w-4 h-4 inline mr-2" />
              By Criteria ({feedback.sectionFeedback?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('document')}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'document'
                  ? 'border-forest-600 text-forest-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />
              Inline Comments ({sortedComments.length})
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {activeTab === 'overall' && feedback.overallFeedback && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Summary</h2>
                  <p className="text-gray-700 leading-relaxed font-serif">{feedback.overallFeedback.summary}</p>
                </div>
                <button
                  onClick={() => askAboutOverall('summary', feedback.overallFeedback!.summary)}
                  className="flex-shrink-0 flex items-center gap-1 text-xs text-forest-600 hover:text-forest-700 hover:bg-forest-50 px-2 py-1 rounded"
                >
                  <Bot className="w-3 h-3" />
                  Ask about this
                </button>
              </div>
            </div>

            {/* What You Did Well */}
            {feedback.overallFeedback.encouragement && (
              <div className="bg-green-50 rounded-lg border border-green-200 p-6">
                <h2 className="text-lg font-semibold text-green-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  What You Did Well
                </h2>
                <p className="text-gray-700 leading-relaxed font-serif">{feedback.overallFeedback.encouragement}</p>
              </div>
            )}

            {/* Priority Improvements */}
            {parseJsonArray(feedback.overallFeedback.priorityImprovements).length > 0 && (
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-lg font-semibold text-amber-900 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Priority Improvements
                  </h2>
                  <button
                    onClick={() => askAboutOverall('improvements', parseJsonArray(feedback.overallFeedback!.priorityImprovements))}
                    className="flex-shrink-0 flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-100 px-2 py-1 rounded"
                  >
                    <Bot className="w-3 h-3" />
                    Ask about this
                  </button>
                </div>
                <ol className="space-y-3">
                  {parseJsonArray(feedback.overallFeedback.priorityImprovements).map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-amber-200 text-amber-800 rounded-full text-sm flex items-center justify-center font-medium">
                        {i + 1}
                      </span>
                      <span className="text-gray-700">{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Next Steps */}
            {parseJsonArray(feedback.overallFeedback.nextSteps).length > 0 && (
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                    <Lightbulb className="w-5 h-5" />
                    Next Steps
                  </h2>
                  <button
                    onClick={() => askAboutOverall('nextSteps', parseJsonArray(feedback.overallFeedback!.nextSteps))}
                    className="flex-shrink-0 flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-100 px-2 py-1 rounded"
                  >
                    <Bot className="w-3 h-3" />
                    Ask about this
                  </button>
                </div>
                <ul className="space-y-2">
                  {parseJsonArray(feedback.overallFeedback.nextSteps).map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-gray-700">
                      <span className="text-blue-500 mt-1">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'criteria' && (
          <div className="space-y-4">
            {feedback.sectionFeedback?.map(section => {
              const isExpanded = expandedSections.has(section.id);
              const strengths = parseJsonArray(section.strengths);
              const areasForGrowth = parseJsonArray(section.areasForGrowth);
              const suggestions = parseJsonArray(section.suggestions);

              return (
                <div key={section.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
                  >
                    <span className="font-semibold text-gray-900">{section.criterion?.name}</span>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      {strengths.length > 0 && (
                        <div className="bg-green-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-green-800 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Strengths
                            </h4>
                            <button
                              onClick={() => askAboutCriterion(section.criterion?.name || 'this criterion', 'strengths', strengths)}
                              className="flex items-center gap-1 text-xs text-green-700 hover:text-green-800 hover:bg-green-100 px-1.5 py-0.5 rounded"
                            >
                              <Bot className="w-3 h-3" />
                              Ask
                            </button>
                          </div>
                          <ul className="space-y-1">
                            {strengths.map((s, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-green-500 mt-0.5">•</span>
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {areasForGrowth.length > 0 && (
                        <div className="bg-amber-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-amber-800 flex items-center gap-1">
                              <TrendingUp className="w-4 h-4" />
                              Areas for Growth
                            </h4>
                            <button
                              onClick={() => askAboutCriterion(section.criterion?.name || 'this criterion', 'growth', areasForGrowth)}
                              className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-100 px-1.5 py-0.5 rounded"
                            >
                              <Bot className="w-3 h-3" />
                              Ask
                            </button>
                          </div>
                          <ul className="space-y-1">
                            {areasForGrowth.map((a, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-amber-500 mt-0.5">•</span>
                                {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {suggestions.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-blue-800 flex items-center gap-1">
                              <Lightbulb className="w-4 h-4" />
                              Suggestions
                            </h4>
                            <button
                              onClick={() => askAboutCriterion(section.criterion?.name || 'this criterion', 'suggestions', suggestions)}
                              className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-100 px-1.5 py-0.5 rounded"
                            >
                              <Bot className="w-3 h-3" />
                              Ask
                            </button>
                          </div>
                          <ul className="space-y-1">
                            {suggestions.map((s, i) => (
                              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                <span className="text-blue-500 mt-0.5">•</span>
                                {s}
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

        {activeTab === 'document' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Submission with Comments</h2>
            {!feedback.extractedText ? (
              <p className="text-gray-500">No document text available.</p>
            ) : (
              <div className="flex gap-4">
                {/* Document with highlights */}
                <div className={`bg-gray-50 rounded-lg p-4 overflow-auto ${sortedComments.length > 0 ? 'flex-1' : 'w-full'}`} style={{ maxHeight: '60vh' }}>
                  <HighlightedDocument text={feedback.extractedText} comments={sortedComments} />
                </div>

                {/* Comments sidebar */}
                {sortedComments.length > 0 && (
                  <div className="w-72 flex-shrink-0 flex flex-col" style={{ maxHeight: '60vh' }}>
                    <h3 className="text-sm font-medium text-gray-700 pb-2 flex-shrink-0">
                      Inline Comments ({sortedComments.length})
                    </h3>
                    <div className="space-y-2 overflow-auto flex-1">
                      {sortedComments.map((comment, idx) => (
                        <div
                          key={comment.id}
                          className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"
                        >
                          <div className="flex items-start gap-2">
                            <span className="flex-shrink-0 w-5 h-5 bg-yellow-400 text-yellow-900 rounded-full text-xs flex items-center justify-center font-medium">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              {comment.criterion && (
                                <p className="text-xs font-medium text-yellow-700 mb-1">
                                  {comment.criterion.name}
                                </p>
                              )}
                              <p className="text-xs text-gray-600 mb-1 italic line-clamp-2">
                                "{comment.highlightedText.slice(0, 60)}{comment.highlightedText.length > 60 ? '...' : ''}"
                              </p>
                              <p className="text-sm text-gray-800">{comment.comment}</p>
                              <button
                                onClick={() => askAboutInlineComment(comment)}
                                className="mt-2 flex items-center gap-1 text-xs text-yellow-700 hover:text-yellow-800 hover:bg-yellow-100 px-1.5 py-0.5 rounded"
                              >
                                <Bot className="w-3 h-3" />
                                Ask about this
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Resubmission Section */}
      <ResubmitPanel token={token!} />

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          Powered by FeedbackLab
        </div>
      </footer>

      {/* Chat */}
      <ChatPanel ref={chatRef} token={token!} />
    </div>
  );
}
