import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, User, CheckCircle, Clock, AlertCircle, Loader2, Trash2, BookOpen, ChevronDown, Eye } from 'lucide-react';
import { submissionsApi, assignmentsApi, type Submission, type Assignment } from '../services/api';
import FeedbackViewer from '../components/FeedbackViewer';

export default function Submissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  // Feedback viewer
  const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [submissionsData, assignmentsData] = await Promise.all([
        submissionsApi.getAll(),
        assignmentsApi.getAll()
      ]);
      setSubmissions(submissionsData);
      setAssignments(assignmentsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    setPendingFiles(prev => [...prev, ...droppedFiles]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setPendingFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;

    setUploading(true);
    setError(null);
    setUploadProgress(`Uploading ${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}...`);

    try {
      const result = await submissionsApi.upload(pendingFiles, selectedAssignment || undefined);

      // Reload submissions
      const updatedSubmissions = await submissionsApi.getAll();
      setSubmissions(updatedSubmissions);
      setPendingFiles([]);
      setUploadProgress(`Successfully uploaded ${result.submissions.length} file${result.submissions.length > 1 ? 's' : ''}`);

      // Clear progress message after 3 seconds
      setTimeout(() => setUploadProgress(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this submission?')) return;
    try {
      await submissionsApi.delete(id);
      setSubmissions(submissions.filter(s => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'reviewed':
      case 'ready': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'reviewed': return 'Reviewed';
      case 'ready': return 'Ready';
      case 'processing': return 'Processing';
      default: return 'Pending';
    }
  };

  // Filter submissions by selected assignment
  const filteredSubmissions = selectedAssignment
    ? submissions.filter(s => s.assignmentId === selectedAssignment)
    : submissions;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Student Submissions</h1>
        <p className="text-gray-600 mt-1">Upload student work for feedback generation</p>
      </div>

      {/* Feedback Viewer */}
      {viewingSubmissionId && (
        <FeedbackViewer
          submissionId={viewingSubmissionId}
          onClose={() => setViewingSubmissionId(null)}
        />
      )}

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

      {/* Upload Section with Assignment Selection */}
      <div className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Assignment Selector Header */}
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">
                Uploading to:
              </label>
              <div className="relative mt-1">
                <select
                  value={selectedAssignment}
                  onChange={(e) => setSelectedAssignment(e.target.value)}
                  className="w-full max-w-md px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white appearance-none text-sm"
                >
                  <option value="">No assignment selected</option>
                  {assignments.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.rubricName ? `- ${a.rubricName}` : '(No rubric)'}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            {selectedAssignment && (
              <div className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">
                {assignments.find(a => a.id === selectedAssignment)?.rubricName || 'No rubric'}
              </div>
            )}
          </div>
          {!selectedAssignment && assignments.length > 0 && (
            <p className="text-xs text-amber-600 mt-2 ml-8">
              Select an assignment to enable rubric-based feedback
            </p>
          )}
          {assignments.length === 0 && !loading && (
            <p className="text-xs text-gray-500 mt-2 ml-8">
              Create an assignment first to link submissions with a rubric.
            </p>
          )}
        </div>

        {/* Compact Upload Area */}
        <div
          className={`p-5 transition-colors ${
            dragActive ? 'bg-indigo-50' : ''
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
            dragActive ? 'border-indigo-500' : 'border-gray-200'
          }`}>
            <div className="flex items-center justify-center gap-4">
              <Upload className="w-8 h-8 text-gray-400" />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">
                  Drag files here or{' '}
                  <label className="text-indigo-600 hover:text-indigo-700 cursor-pointer">
                    browse
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp"
                      onChange={handleFileChange}
                    />
                  </label>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  PDF, Word, Images, Text files supported
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Files List */}
      {pendingFiles.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">
                  Ready to Upload ({pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''})
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selectedAssignment
                    ? <>To: <span className="font-medium text-indigo-600">{assignments.find(a => a.id === selectedAssignment)?.name}</span></>
                    : <span className="text-amber-600">No assignment selected</span>
                  }
                </p>
              </div>
              <div className="flex items-center gap-3">
                {uploadProgress && (
                  <span className="text-sm text-green-600">{uploadProgress}</span>
                )}
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
                >
                  {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {uploading ? 'Uploading...' : 'Upload All'}
                </button>
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-200 max-h-48 overflow-auto">
            {pendingFiles.map((file, index) => (
              <div key={index} className="px-4 py-3 flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  onClick={() => removePendingFile(index)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="ml-3 text-gray-600">Loading submissions...</span>
        </div>
      )}

      {/* Submissions List */}
      {!loading && filteredSubmissions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              Submissions ({filteredSubmissions.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200">
            {filteredSubmissions.map((submission) => (
              <div key={submission.id} className="p-4 flex items-center gap-4 hover:bg-gray-50">
                <FileText className="w-8 h-8 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{submission.fileName}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(submission.submittedAt).toLocaleString()}
                  </p>
                </div>
                {submission.studentName && (
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{submission.studentName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {getStatusIcon(submission.status)}
                  <span className="text-sm text-gray-500">{getStatusLabel(submission.status)}</span>
                </div>
                {(submission.status === 'ready' || submission.status === 'reviewed') && (
                  <button
                    onClick={() => setViewingSubmissionId(submission.id)}
                    className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    View Feedback
                  </button>
                )}
                <button
                  onClick={() => handleDelete(submission.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredSubmissions.length === 0 && pendingFiles.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No submissions yet</h3>
          <p className="text-gray-500">Upload student work to get started with feedback generation.</p>
        </div>
      )}
    </div>
  );
}
