/**
 * FeedbackReview — Review and approve AI-generated feedback before release
 *
 * Placeholder page that will display a queue of pending AI-generated feedback
 * for instructor review. Shows stats for pending, released, and student
 * question counts, with a table for reviewing individual submissions.
 */
import { FileText, MessageSquare, Clock, CheckCircle } from 'lucide-react';

export default function FeedbackReview() {
  // Placeholder - will be populated from backend
  const pendingFeedback: any[] = [];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Feedback Review</h1>
        <p className="text-gray-600 mt-1">Review and approve AI-generated feedback before releasing to students</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-sm text-gray-500">Pending Review</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-sm text-gray-500">Released to Students</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <MessageSquare className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">0</p>
              <p className="text-sm text-gray-500">Student Questions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Queue */}
      {pendingFeedback.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No feedback to review</h3>
          <p className="text-gray-500 mb-2">
            Upload submissions and generate feedback to see them here.
          </p>
          <p className="text-sm text-gray-400">
            Feedback includes inline comments and rubric-based suggestions.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Pending Review</h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Student</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Assignment</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Inline Comments</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Rows will be populated dynamically */}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
