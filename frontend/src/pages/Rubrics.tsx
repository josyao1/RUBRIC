import { useState, useCallback, useEffect } from 'react';
import { Plus, Upload, FileText, Trash2, GripVertical, Loader2, AlertCircle, Eye, Image, MessageSquare, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { rubricsApi, getFileUrl, type Rubric, type Criterion } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

export default function Rubrics() {
  const { user } = useAuth();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [viewingRubric, setViewingRubric] = useState<Rubric | null>(null);

  // Fetch rubrics on mount
  useEffect(() => {
    loadRubrics();
  }, []);

  const loadRubrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rubricsApi.getAll();
      setRubrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rubrics');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rubric?')) return;
    try {
      await rubricsApi.delete(id);
      setRubrics(rubrics.filter(r => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rubric');
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rubrics</h1>
          <p className="text-gray-600 mt-1">Manage your feedback rubrics</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Rubric
          </button>
          <button
            onClick={() => setShowBuilder(true)}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Rubric
          </button>
        </div>
      </div>

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

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUpload={(rubric) => {
            setRubrics([rubric, ...rubrics]);
            setShowUpload(false);
          }}
          userId={user?.id}
        />
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <BuilderModal
          onClose={() => setShowBuilder(false)}
          onSave={(rubric) => {
            setRubrics([rubric, ...rubrics]);
            setShowBuilder(false);
          }}
          userId={user?.id}
        />
      )}

      {/* View Modal */}
      {viewingRubric && (
        <ViewRubricModal
          rubric={viewingRubric}
          onClose={() => setViewingRubric(null)}
        />
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="ml-3 text-gray-600">Loading rubrics...</span>
        </div>
      )}

      {/* Rubrics List */}
      {!loading && rubrics.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No rubrics yet</h3>
          <p className="text-gray-500 mb-6">Upload an existing rubric or create one from scratch.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </button>
            <button
              onClick={() => setShowBuilder(true)}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create
            </button>
          </div>
        </div>
      ) : !loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rubrics.map((rubric) => (
            <RubricCard
              key={rubric.id}
              rubric={rubric}
              onDelete={() => handleDelete(rubric.id)}
              onView={() => setViewingRubric(rubric)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RubricCard({ rubric, onDelete, onView }: { rubric: Rubric; onDelete: () => void; onView: () => void }) {
  const hasCriteria = rubric.criteria && rubric.criteria.length > 0;
  const hasLevels = rubric.criteria?.some(c => c.levels && c.levels.length > 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className={`p-2 rounded-lg ${hasCriteria ? 'bg-indigo-100' : 'bg-yellow-100'}`}>
            <FileText className={`w-5 h-5 ${hasCriteria ? 'text-indigo-600' : 'text-yellow-600'}`} />
          </div>
          <div className="ml-3">
            <h3 className="font-semibold text-gray-900">{rubric.name}</h3>
            <p className="text-sm text-gray-500">
              {hasCriteria
                ? `${rubric.criteria.length} criteria${hasLevels ? ' with levels' : ''}`
                : 'Processing...'}
            </p>
          </div>
        </div>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{rubric.description || 'No description'}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {hasCriteria ? 'Ready for feedback' : 'Awaiting AI'}
        </span>
        <button
          onClick={onView}
          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
        >
          <Eye className="w-4 h-4" />
          View
        </button>
      </div>
    </div>
  );
}

function UploadModal({ onClose, onUpload, userId }: {
  onClose: () => void;
  onUpload: (rubric: Rubric) => void;
  userId?: string;
}) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const rubric = await rubricsApi.upload(file, userId);
      onUpload(rubric);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Upload Rubric</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-indigo-600" />
              <span className="font-medium">{file.name}</span>
              <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-2">Drag and drop your rubric file here</p>
              <p className="text-sm text-gray-500 mb-2">Supported formats:</p>
              <div className="flex flex-wrap justify-center gap-2 mb-4">
                <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">PDF</span>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">Word (.docx)</span>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">Images (.png, .jpg)</span>
                <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">Text (.txt)</span>
              </div>
              <label className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.txt"
                  onChange={handleFileChange}
                />
                Browse Files
              </label>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {uploading ? 'Processing with AI...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BuilderModal({ onClose, onSave, userId }: {
  onClose: () => void;
  onSave: (rubric: Rubric) => void;
  userId?: string;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<Criterion[]>([
    { name: '', description: '', levels: [
      { label: 'Excellent', description: '' },
      { label: 'Good', description: '' },
      { label: 'Developing', description: '' },
      { label: 'Beginning', description: '' }
    ] }
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCriterion = () => {
    setCriteria([
      ...criteria,
      { name: '', description: '', levels: [
        { label: 'Excellent', description: '' },
        { label: 'Good', description: '' },
        { label: 'Developing', description: '' },
        { label: 'Beginning', description: '' }
      ] }
    ]);
  };

  const updateCriterion = (index: number, field: string, value: string) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };
    setCriteria(updated);
  };

  const removeCriterion = (index: number) => {
    if (criteria.length > 1) {
      setCriteria(criteria.filter((_, i) => i !== index));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const rubric = await rubricsApi.create({
        name,
        description,
        criteria: criteria.filter(c => c.name.trim()),
        userId,
      });
      onSave(rubric);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rubric');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Create Rubric</h2>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rubric Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Essay Feedback Rubric"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Criteria */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Feedback Criteria</label>
              <span className="text-sm text-gray-500">{criteria.length} criteria</span>
            </div>
            <div className="space-y-3">
              {criteria.map((criterion, index) => (
                <div key={index} className="flex gap-3 items-start p-4 bg-gray-50 rounded-lg">
                  <GripVertical className="w-5 h-5 text-gray-400 mt-2 cursor-grab" />
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={criterion.name}
                      onChange={(e) => updateCriterion(index, 'name', e.target.value)}
                      placeholder="Criterion name (e.g., Thesis Statement)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <textarea
                      value={criterion.description}
                      onChange={(e) => updateCriterion(index, 'description', e.target.value)}
                      placeholder="What this criterion evaluates..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <button
                    onClick={() => removeCriterion(index)}
                    className="text-gray-400 hover:text-red-500 mt-2"
                    disabled={criteria.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addCriterion}
              className="mt-3 flex items-center text-sm text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Criterion
            </button>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {saving ? 'Saving...' : 'Save Rubric'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewRubricModal({ rubric, onClose }: {
  rubric: Rubric;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'criteria' | 'source' | 'feedback'>('criteria');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [name, setName] = useState(rubric.name);
  const [description, setDescription] = useState(rubric.description || '');
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [sourceFile, setSourceFile] = useState<string | undefined>();

  // Feedback state
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackFetching, setFeedbackFetching] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<{
    id: string;
    feedback: string;
    generatedAt: string;
  } | null>(null);
  const [feedbackChecked, setFeedbackChecked] = useState(false);

  // Fetch full rubric with criteria and levels
  useEffect(() => {
    const fetchFull = async () => {
      try {
        const full = await rubricsApi.getById(rubric.id);
        setName(full.name);
        setDescription(full.description || '');
        setCriteria(full.criteria || []);
        setSourceFile(full.sourceFile);
      } catch (err) {
        console.error('Failed to fetch rubric details:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFull();
  }, [rubric.id]);

  const hasLevels = criteria.some(c => c.levels && c.levels.length > 0);

  // Get all unique level labels across all criteria
  const allLevelLabels = hasLevels
    ? [...new Set(criteria.flatMap(c => c.levels?.map(l => l.label) || []))]
    : [];

  const updateCriterion = (index: number, field: string, value: string) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: value };
    setCriteria(updated);
  };

  const updateLevel = (criterionIndex: number, levelIndex: number, field: string, value: string) => {
    const updated = [...criteria];
    const levels = [...(updated[criterionIndex].levels || [])];
    levels[levelIndex] = { ...levels[levelIndex], [field]: value };
    updated[criterionIndex] = { ...updated[criterionIndex], levels };
    setCriteria(updated);
  };

  const addCriterion = () => {
    const defaultLevels = allLevelLabels.length > 0
      ? allLevelLabels.map(label => ({ label, description: '' }))
      : [
          { label: 'Excellent', description: '' },
          { label: 'Good', description: '' },
          { label: 'Developing', description: '' },
          { label: 'Beginning', description: '' }
        ];
    setCriteria([...criteria, { name: '', description: '', levels: defaultLevels }]);
  };

  const removeCriterion = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await rubricsApi.update(rubric.id, { name, description, criteria });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save rubric:', err);
    } finally {
      setSaving(false);
    }
  };

  // Load existing feedback when switching to feedback tab
  useEffect(() => {
    if (activeTab === 'feedback' && !feedbackChecked && !feedbackResult) {
      loadExistingFeedback();
    }
  }, [activeTab]);

  const loadExistingFeedback = async () => {
    setFeedbackFetching(true);
    setFeedbackChecked(true);
    try {
      const result = await rubricsApi.getExistingFeedback(rubric.id);
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
      const result = await rubricsApi.generateFeedback(rubric.id);
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              {isEditing ? (
                <>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-xl font-bold text-gray-900 w-full px-2 py-1 border border-gray-300 rounded"
                    placeholder="Rubric name"
                  />
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="text-sm text-gray-500 w-full px-2 py-1 mt-2 border border-gray-300 rounded"
                    placeholder="Description (optional)"
                  />
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900">{name}</h2>
                  <p className="text-gray-500 text-sm mt-1">{description || 'No description'}</p>
                </>
              )}
            </div>
            <div className="ml-4">
              <span className="text-sm text-gray-500">{criteria.length} criteria</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('criteria')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'criteria'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Rubric Table
            </button>
            <button
              onClick={() => setActiveTab('source')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'source'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Image className="w-4 h-4" />
              Original Document
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === 'feedback'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              AI Feedback
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="ml-3 text-gray-600">Loading rubric...</span>
            </div>
          ) : activeTab === 'criteria' ? (
            <div>
              {criteria.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>No criteria yet.</p>
                  {isEditing && (
                    <button onClick={addCriterion} className="mt-4 text-indigo-600 hover:text-indigo-700">
                      + Add Criterion
                    </button>
                  )}
                </div>
              ) : hasLevels ? (
                /* Table view with levels */
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700 w-48">
                          Criteria
                        </th>
                        {allLevelLabels.map(label => (
                          <th key={label} className="border border-gray-300 px-4 py-3 text-center font-semibold text-gray-700 min-w-[200px]">
                            {label}
                          </th>
                        ))}
                        {isEditing && <th className="border border-gray-300 px-2 py-3 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {criteria.map((criterion, idx) => (
                        <tr key={criterion.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 px-4 py-3 align-top">
                            {isEditing ? (
                              <>
                                <input
                                  type="text"
                                  value={criterion.name}
                                  onChange={(e) => updateCriterion(idx, 'name', e.target.value)}
                                  className="font-medium text-gray-900 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                  placeholder="Criterion name"
                                />
                                <textarea
                                  value={criterion.description}
                                  onChange={(e) => updateCriterion(idx, 'description', e.target.value)}
                                  className="text-sm text-gray-500 w-full px-2 py-1 mt-2 border border-gray-300 rounded"
                                  placeholder="Description"
                                  rows={2}
                                />
                              </>
                            ) : (
                              <>
                                <div className="font-medium text-gray-900">{criterion.name}</div>
                                {criterion.description && (
                                  <div className="text-sm text-gray-500 mt-1">{criterion.description}</div>
                                )}
                              </>
                            )}
                          </td>
                          {allLevelLabels.map((label) => {
                            const level = criterion.levels?.find(l => l.label === label);
                            const actualLevelIdx = criterion.levels?.findIndex(l => l.label === label) ?? -1;
                            return (
                              <td key={label} className="border border-gray-300 px-4 py-3 align-top text-sm">
                                {isEditing ? (
                                  <textarea
                                    value={level?.description || ''}
                                    onChange={(e) => actualLevelIdx >= 0 && updateLevel(idx, actualLevelIdx, 'description', e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                    placeholder={`Describe ${label} performance`}
                                    rows={3}
                                  />
                                ) : level ? (
                                  <div className="text-gray-700">{level.description}</div>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            );
                          })}
                          {isEditing && (
                            <td className="border border-gray-300 px-2 py-3 align-top">
                              <button
                                onClick={() => removeCriterion(idx)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {isEditing && (
                    <button
                      onClick={addCriterion}
                      className="mt-4 flex items-center text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Criterion
                    </button>
                  )}
                </div>
              ) : (
                /* Simple list view when no levels */
                <div className="space-y-4">
                  {criteria.map((criterion, idx) => (
                    <div key={criterion.id || idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      {isEditing ? (
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <input
                              type="text"
                              value={criterion.name}
                              onChange={(e) => updateCriterion(idx, 'name', e.target.value)}
                              className="font-medium text-gray-900 w-full px-2 py-1 border border-gray-300 rounded"
                              placeholder="Criterion name"
                            />
                            <textarea
                              value={criterion.description}
                              onChange={(e) => updateCriterion(idx, 'description', e.target.value)}
                              className="text-sm w-full px-2 py-1 mt-2 border border-gray-300 rounded"
                              placeholder="Description"
                              rows={2}
                            />
                          </div>
                          <button onClick={() => removeCriterion(idx)} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <h3 className="font-medium text-gray-900">{criterion.name}</h3>
                          {criterion.description && (
                            <p className="text-sm text-gray-600 mt-2">{criterion.description}</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {isEditing && (
                    <button
                      onClick={addCriterion}
                      className="flex items-center text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add Criterion
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'source' ? (
            /* Source file preview */
            <div>
              {sourceFile ? (
                <div className="flex flex-col items-center">
                  <p className="text-sm text-gray-500 mb-4">Original uploaded document</p>
                  {sourceFile.match(/\.(png|jpg|jpeg|webp)$/i) ? (
                    <img
                      src={getFileUrl(rubric.id)}
                      alt="Rubric document"
                      className="max-w-full max-h-[60vh] rounded-lg shadow-lg"
                    />
                  ) : sourceFile.match(/\.pdf$/i) ? (
                    <iframe
                      src={getFileUrl(rubric.id)}
                      className="w-full h-[60vh] rounded-lg border border-gray-200"
                      title="Rubric PDF"
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p>Document preview not available for this file type.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>No source document (rubric was created manually)</p>
                </div>
              )}
            </div>
          ) : (
            /* AI Feedback tab */
            <div>
              {feedbackError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {feedbackError}
                </div>
              )}

              {feedbackFetching ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                  <span className="ml-3 text-gray-600">Loading feedback...</span>
                </div>
              ) : !feedbackResult ? (
                <div className="text-center py-12">
                  <Sparkles className="w-12 h-12 mx-auto mb-4 text-indigo-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Get AI Feedback on Your Rubric</h3>
                  <p className="text-gray-500 mb-6 max-w-md mx-auto">
                    Our AI will analyze your rubric and provide suggestions for improving clarity,
                    specificity, and alignment of your criteria and performance levels.
                  </p>
                  <button
                    onClick={handleGenerateFeedback}
                    disabled={feedbackLoading || criteria.length === 0}
                    className="inline-flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  {criteria.length === 0 && (
                    <p className="text-sm text-amber-600 mt-4">
                      Add criteria to your rubric before requesting feedback.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-medium text-gray-900">AI Feedback</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        Generated {new Date(feedbackResult.generatedAt).toLocaleString()}
                      </span>
                      <button
                        onClick={handleGenerateFeedback}
                        disabled={feedbackLoading}
                        className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
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
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-between">
          <div>
            {!isEditing && activeTab === 'criteria' && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
              >
                Edit Rubric
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Feedback Cards Component - renders feedback in card-style sections
function FeedbackCards({ feedback }: { feedback: string }) {
  // Split feedback into sections by ## headers, only keep sections that start with ##
  const allParts = feedback.split(/(?=^## )/gm).filter(s => s.trim());
  const sections = allParts.filter(s => s.startsWith('## '));

  // Get intro text (content before first ## header)
  const firstSection = allParts[0];
  const introText = firstSection && !firstSection.startsWith('## ') ? firstSection.trim() : '';

  // Section icons based on title keywords
  const getSectionStyle = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes('overall') || lower.includes('assessment') || lower.includes('summary')) {
      return { bg: 'bg-indigo-50', border: 'border-indigo-200', accent: 'bg-indigo-500', text: 'text-indigo-900' };
    }
    if (lower.includes('transparency') || lower.includes('clarity')) {
      return { bg: 'bg-blue-50', border: 'border-blue-200', accent: 'bg-blue-500', text: 'text-blue-900' };
    }
    if (lower.includes('quality') || lower.includes('progression') || lower.includes('level')) {
      return { bg: 'bg-purple-50', border: 'border-purple-200', accent: 'bg-purple-500', text: 'text-purple-900' };
    }
    if (lower.includes('learning') || lower.includes('scoring') || lower.includes('focus')) {
      return { bg: 'bg-green-50', border: 'border-green-200', accent: 'bg-green-500', text: 'text-green-900' };
    }
    if (lower.includes('equity') || lower.includes('accessibility') || lower.includes('bias')) {
      return { bg: 'bg-amber-50', border: 'border-amber-200', accent: 'bg-amber-500', text: 'text-amber-900' };
    }
    if (lower.includes('co-creation') || lower.includes('student') || lower.includes('involve')) {
      return { bg: 'bg-teal-50', border: 'border-teal-200', accent: 'bg-teal-500', text: 'text-teal-900' };
    }
    if (lower.includes('recommendation') || lower.includes('suggestion') || lower.includes('action')) {
      return { bg: 'bg-rose-50', border: 'border-rose-200', accent: 'bg-rose-500', text: 'text-rose-900' };
    }
    return { bg: 'bg-gray-50', border: 'border-gray-200', accent: 'bg-gray-500', text: 'text-gray-900' };
  };

  const markdownComponents = {
    p: ({ children }: any) => (
      <p className="text-gray-700 leading-relaxed mb-3">{children}</p>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc list-outside ml-5 mb-4 space-y-2">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-outside ml-5 mb-4 space-y-2">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="text-gray-700 leading-relaxed">{children}</li>
    ),
    strong: ({ children }: any) => (
      <strong className="font-semibold text-gray-900">{children}</strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-gray-600">{children}</em>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-amber-400 bg-amber-50 px-4 py-2 my-3 italic text-gray-700 rounded-r">
        {children}
      </blockquote>
    ),
    code: ({ children }: any) => (
      <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800">{children}</code>
    ),
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border border-gray-300 text-sm rounded-lg overflow-hidden">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-gray-100">{children}</thead>
    ),
    th: ({ children }: any) => (
      <th className="border border-gray-300 px-3 py-2 text-left font-semibold text-gray-700">{children}</th>
    ),
    td: ({ children }: any) => (
      <td className="border border-gray-300 px-3 py-2 text-gray-700">{children}</td>
    ),
    h3: ({ children }: any) => (
      <h3 className="font-semibold text-gray-800 mt-4 mb-2">{children}</h3>
    ),
  };

  return (
    <div className="space-y-4">
      {/* Overview card for intro text */}
      {introText && (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3">
            <h2 className="text-white font-bold text-lg">Overview</h2>
          </div>
          <div className="p-5 bg-white">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {introText}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Section cards */}
      {sections.map((section, idx) => {
        // Extract title from ## header
        const titleMatch = section.match(/^## (.+?)[\r\n]/);
        const title = titleMatch ? titleMatch[1].trim() : 'Section';
        const content = section.replace(/^## .+?[\r\n]/, '').trim();
        const style = getSectionStyle(title);

        return (
          <div
            key={idx}
            className={`${style.bg} border ${style.border} rounded-xl overflow-hidden shadow-sm`}
          >
            {/* Card header */}
            <div className={`${style.accent} px-5 py-3`}>
              <h2 className="text-white font-bold text-lg">{title}</h2>
            </div>
            {/* Card content */}
            <div className="p-5 bg-white bg-opacity-60">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        );
      })}
    </div>
  );
}
