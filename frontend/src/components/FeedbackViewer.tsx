import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Loader2, FileText, MessageSquare, CheckCircle,
  TrendingUp, Lightbulb, ChevronDown, ChevronRight, User
} from 'lucide-react';
import { submissionsApi, type SubmissionWithFeedback } from '../services/api';

interface FeedbackViewerProps {
  submissionId: string;
  onClose: () => void;
}

export default function FeedbackViewer({ submissionId, onClose }: FeedbackViewerProps) {
  const [submission, setSubmission] = useState<SubmissionWithFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'document' | 'sections' | 'overall'>('document');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  const loadSubmission = async () => {
    try {
      setLoading(true);
      const data = await submissionsApi.getById(submissionId);
      setSubmission(data);
      // Expand all sections by default
      if (data.sectionFeedback) {
        setExpandedSections(new Set(data.sectionFeedback.map(s => s.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submission');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Parse JSON arrays safely
  const parseJsonArray = (str: string): string[] => {
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  };

  // Sort inline comments by position
  const sortedComments = useMemo(() => {
    if (!submission?.inlineComments) return [];
    return [...submission.inlineComments].sort((a, b) => a.startPosition - b.startPosition);
  }, [submission]);

  // Render text with highlights
  const renderHighlightedText = () => {
    if (!submission?.extractedText) return null;

    const text = submission.extractedText;
    const comments = sortedComments;

    if (comments.length === 0) {
      return <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{text}</pre>;
    }

    const segments: React.ReactNode[] = [];
    let lastEnd = 0;

    comments.forEach((comment, idx) => {
      // Add text before this highlight
      if (comment.startPosition > lastEnd) {
        segments.push(
          <span key={`text-${idx}`}>
            {text.slice(lastEnd, comment.startPosition)}
          </span>
        );
      }

      // Add highlighted text
      segments.push(
        <span
          key={`highlight-${idx}`}
          className="bg-yellow-200 hover:bg-yellow-300 cursor-pointer relative group"
          title={comment.comment}
        >
          {text.slice(comment.startPosition, comment.endPosition)}
          <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-gray-900 text-white text-xs p-2 rounded shadow-lg max-w-xs z-10">
            {comment.criterion && (
              <span className="text-yellow-300 font-medium block mb-1">
                {comment.criterion.name}
              </span>
            )}
            {comment.comment}
          </span>
        </span>
      );

      lastEnd = comment.endPosition;
    });

    // Add remaining text
    if (lastEnd < text.length) {
      segments.push(<span key="text-end">{text.slice(lastEnd)}</span>);
    }

    return <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">{segments}</pre>;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
          <p className="mt-3 text-gray-600">Loading feedback...</p>
        </div>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8 max-w-md">
          <p className="text-red-600 mb-4">{error || 'Submission not found'}</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-lg">
            Close
          </button>
        </div>
      </div>
    );
  }

  const hasFeedback = submission.inlineComments?.length > 0 ||
    submission.sectionFeedback?.length > 0 ||
    submission.overallFeedback;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-gray-400" />
            <div>
              <h2 className="font-semibold text-gray-900">{submission.fileName}</h2>
              {submission.studentName && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {submission.studentName}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('document')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'document'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare className="w-4 h-4 inline mr-2" />
            Document with Comments ({sortedComments.length})
          </button>
          <button
            onClick={() => setActiveTab('sections')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'sections'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <CheckCircle className="w-4 h-4 inline mr-2" />
            Criteria Feedback ({submission.sectionFeedback?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('overall')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
              activeTab === 'overall'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <TrendingUp className="w-4 h-4 inline mr-2" />
            Overall Feedback
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {!hasFeedback ? (
            <div className="text-center py-12">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No feedback yet</h3>
              <p className="text-gray-500">
                Feedback will appear here after feedback generation is complete.
              </p>
            </div>
          ) : activeTab === 'document' ? (
            <div className="flex gap-4 h-full min-h-[400px]">
              {/* Document with highlights */}
              <div className={`bg-gray-50 rounded-lg p-4 overflow-auto ${sortedComments.length > 0 ? 'flex-1' : 'w-full'}`} style={{ maxHeight: 'calc(90vh - 200px)' }}>
                {submission.extractedText ? (
                  renderHighlightedText()
                ) : (
                  <p className="text-gray-500 text-sm italic">No text content available</p>
                )}
              </div>

              {/* Comments sidebar */}
              {sortedComments.length > 0 && (
                <div className="w-72 flex-shrink-0 flex flex-col" style={{ maxHeight: 'calc(90vh - 200px)' }}>
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'sections' ? (
            <div className="space-y-3 max-w-3xl mx-auto">
              {(!submission.sectionFeedback || submission.sectionFeedback.length === 0) ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No criteria feedback available.</p>
                </div>
              ) : submission.sectionFeedback?.map(section => {
                const isExpanded = expandedSections.has(section.id);
                const strengths = parseJsonArray(section.strengths);
                const areasForGrowth = parseJsonArray(section.areasForGrowth);
                const suggestions = parseJsonArray(section.suggestions);

                return (
                  <div
                    key={section.id}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
                    >
                      <span className="font-medium text-gray-900">
                        {section.criterion.name}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-4">
                        {strengths.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Strengths
                            </h4>
                            <ul className="space-y-1">
                              {strengths.map((s, i) => (
                                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-green-500 mt-1">•</span>
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {areasForGrowth.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1">
                              <TrendingUp className="w-4 h-4" />
                              Areas for Growth
                            </h4>
                            <ul className="space-y-1">
                              {areasForGrowth.map((a, i) => (
                                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-amber-500 mt-1">•</span>
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {suggestions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-blue-700 mb-2 flex items-center gap-1">
                              <Lightbulb className="w-4 h-4" />
                              Suggestions
                            </h4>
                            <ul className="space-y-1">
                              {suggestions.map((s, i) => (
                                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                  <span className="text-blue-500 mt-1">•</span>
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
          ) : activeTab === 'overall' ? (
            submission.overallFeedback ? (
            <div className="max-w-3xl space-y-6">
              {/* Summary */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h3 className="font-medium text-indigo-900 mb-2">Summary</h3>
                <p className="text-gray-700">{submission.overallFeedback.summary}</p>
              </div>

              {/* Encouragement */}
              {submission.overallFeedback.encouragement && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    What You Did Well
                  </h3>
                  <p className="text-gray-700">{submission.overallFeedback.encouragement}</p>
                </div>
              )}

              {/* Priority Improvements */}
              {parseJsonArray(submission.overallFeedback.priorityImprovements).length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="font-medium text-amber-900 mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Priority Improvements
                  </h3>
                  <ul className="space-y-2">
                    {parseJsonArray(submission.overallFeedback.priorityImprovements).map((p, i) => (
                      <li key={i} className="text-gray-700 flex items-start gap-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-amber-200 text-amber-800 rounded-full text-xs flex items-center justify-center font-medium">
                          {i + 1}
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next Steps */}
              {parseJsonArray(submission.overallFeedback.nextSteps).length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Next Steps
                  </h3>
                  <ul className="space-y-2">
                    {parseJsonArray(submission.overallFeedback.nextSteps).map((s, i) => (
                      <li key={i} className="text-gray-700 flex items-start gap-2">
                        <span className="text-blue-500">→</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            ) : (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No overall feedback available.</p>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
