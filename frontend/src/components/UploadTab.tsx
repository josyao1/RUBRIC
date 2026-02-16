/**
 * UploadTab — Drag-and-drop file upload tab for student submissions
 *
 * Renders inside AssignmentDetailModal. Supports drag-and-drop and click-to-browse
 * file selection, displays selected files, and uploads them as submissions
 * to the selected assignment via assignmentsApi.
 */
import { useState, useCallback } from 'react';
import { Upload, FileText, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { assignmentsApi } from '../services/api';

interface UploadTabProps {
  assignmentId: string;
  onUploadComplete: () => Promise<void>;
}

export default function UploadTab({ assignmentId, onUploadComplete }: UploadTabProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setPendingFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPendingFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await assignmentsApi.uploadSubmissions(assignmentId, pendingFiles);
      setPendingFiles([]);
      await onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="p-4">
      {/* Error banner */}
      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xs">Dismiss</button>
        </div>
      )}

      {/* Drag and drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-forest-500 bg-forest-50' : 'border-gray-200 hover:border-gray-300'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-900 mb-1">
          Drag files here or{' '}
          <label className="text-forest-600 hover:text-forest-700 cursor-pointer underline">
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
        <p className="text-xs text-gray-500">PDF, Word, Images, Text files supported</p>
      </div>

      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-900">
              Ready to Upload ({pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''})
            </h4>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex items-center px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50 text-sm"
            >
              {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {uploading ? 'Uploading...' : 'Upload All'}
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-auto">
            {pendingFiles.map((file, index) => (
              <div key={index} className="px-3 py-2.5 flex items-center gap-3">
                <FileText className="w-4 h-4 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== index))}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
