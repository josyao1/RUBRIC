/**
 * RubricFeedbackTab — Tab content for loading/generating AI rubric feedback
 *
 * Used inside ViewRubricModal. Fetches existing AI feedback for a rubric
 * or triggers generation of new feedback, displaying results via FeedbackCards.
 */
import { useState, useEffect } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { rubricsApi } from '../services/api';
import FeedbackCards from './FeedbackCards';

interface RubricFeedbackTabProps {
  rubricId: string;
  criteriaCount: number;
  isActive: boolean;
}

export default function RubricFeedbackTab({ rubricId, criteriaCount, isActive }: RubricFeedbackTabProps) {
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackFetching, setFeedbackFetching] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<{
    id: string;
    feedback: string;
    generatedAt: string;
  } | null>(null);
  const [feedbackChecked, setFeedbackChecked] = useState(false);

  // Load existing feedback when switching to feedback tab
  useEffect(() => {
    if (isActive && !feedbackChecked && !feedbackResult) {
      loadExistingFeedback();
    }
  }, [isActive]);

  const loadExistingFeedback = async () => {
    setFeedbackFetching(true);
    setFeedbackChecked(true);
    try {
      const result = await rubricsApi.getExistingFeedback(rubricId);
      setFeedbackResult({
        id: result.id,
        feedback: result.feedback,
        generatedAt: result.generatedAt
      });
    } catch (err) {
      // No existing feedback is fine, user can generate new
      console.log('No existing feedback found');
    } finally {
      setFeedbackFetching(false);
    }
  };

  const handleGenerateFeedback = async () => {
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const result = await rubricsApi.generateFeedback(rubricId);
      setFeedbackResult({
        id: result.id,
        feedback: result.feedback,
        generatedAt: result.generatedAt
      });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Failed to generate feedback');
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div>
      {feedbackError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {feedbackError}
        </div>
      )}

      {feedbackFetching ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
          <span className="ml-3 text-gray-600">Loading feedback...</span>
        </div>
      ) : !feedbackResult ? (
        <div className="text-center py-12">
          <Sparkles className="w-12 h-12 mx-auto mb-4 text-forest-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Get AI Feedback on Your Rubric</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Our AI will analyze your rubric and provide suggestions for improving clarity,
            specificity, and alignment of your criteria and performance levels.
          </p>
          <button
            onClick={handleGenerateFeedback}
            disabled={feedbackLoading || criteriaCount === 0}
            className="inline-flex items-center px-6 py-3 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {feedbackLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Analyzing Rubric...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Get Feedback
              </>
            )}
          </button>
          {criteriaCount === 0 && (
            <p className="text-sm text-amber-600 mt-4">
              Add criteria to your rubric before requesting feedback.
            </p>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-forest-600" />
              <h3 className="font-medium text-gray-900">AI Feedback</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                Generated {new Date(feedbackResult.generatedAt).toLocaleString()}
              </span>
              <button
                onClick={handleGenerateFeedback}
                disabled={feedbackLoading}
                className="text-sm text-forest-600 hover:text-forest-700 flex items-center gap-1"
              >
                {feedbackLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Regenerate
                  </>
                )}
              </button>
            </div>
          </div>
          <FeedbackCards feedback={feedbackResult.feedback} />
        </div>
      )}
    </div>
  );
}
