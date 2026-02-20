/**
 * ResubmitPanel — Collapsible panel for uploading revised submissions
 *
 * Provides a drag-and-drop file upload area for students to resubmit work.
 * Collapses by default and expands to show upload controls and status.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Upload, ChevronDown, ChevronRight, CheckCircle,
  FileText, Trash2, Loader2
} from 'lucide-react';
import { studentsApi } from '../services/api';

interface ResubmitPanelProps {
  token: string;
}

export default function ResubmitPanel({ token }: ResubmitPanelProps) {
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitFile, setResubmitFile] = useState<File | null>(null);
  const [resubmitLoading, setResubmitLoading] = useState(false);
  const [resubmitSuccess, setResubmitSuccess] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (!resubmitSuccess) return;
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resubmitSuccess]);
  const [dragActive, setDragActive] = useState(false);

  const handleResubmit = async () => {
    if (!resubmitFile || !token) return;
    setResubmitLoading(true);
    setResubmitError(null);
    try {
      await studentsApi.resubmit(token, resubmitFile);
      setResubmitSuccess(true);
      setResubmitFile(null);
    } catch (err) {
      setResubmitError(err instanceof Error ? err.message : 'Failed to submit revision');
    } finally {
      setResubmitLoading(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragActive(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) setResubmitFile(file);
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pb-8">
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => setResubmitOpen(!resubmitOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
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
          <div className="p-6 border-t border-gray-100 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                Upload a revised version of your work. Updated feedback will be provided.
              </p>
            </div>

            {resubmitSuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
                <h3 className="font-semibold text-green-900 mb-1">Revision Submitted Successfully</h3>
                <p className="text-sm text-green-700 mb-1">Your revision is being graded — please wait about a minute for updated feedback.</p>
                <p className="text-sm text-green-600 mb-4">
                  Page refreshing automatically in <span className="font-semibold">{countdown}s</span>
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="text-sm text-green-700 hover:text-green-800 underline"
                >
                  Refresh now
                </button>
              </div>
            ) : (
              <>
                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive ? 'border-forest-400 bg-forest-50' : 'border-gray-300 bg-gray-50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-1">
                    Drag and drop your file here, or{' '}
                    <label className="text-forest-600 hover:text-forest-700 cursor-pointer underline">
                      browse
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.doc,.txt,.py,.java,.js,.ts,.cpp,.c,.html,.css,.md,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setResubmitFile(file);
                        }}
                      />
                    </label>
                  </p>
                  <p className="text-xs text-gray-500">PDF, Word, text, code, or image files</p>
                </div>

                {/* File preview */}
                {resubmitFile && (
                  <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-3">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{resubmitFile.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(resubmitFile.size)}</p>
                    </div>
                    <button
                      onClick={() => setResubmitFile(null)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Submit button */}
                <button
                  onClick={handleResubmit}
                  disabled={!resubmitFile || resubmitLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-forest-600 text-white rounded-lg hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resubmitLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Submit Revision
                    </>
                  )}
                </button>

                {/* Error display */}
                {resubmitError && (
                  <p className="text-sm text-red-600 text-center">{resubmitError}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
