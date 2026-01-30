import { useState, useCallback, useEffect } from 'react';
import { Plus, Upload, FileText, Trash2, GripVertical, Loader2, AlertCircle } from 'lucide-react';
import { rubricsApi, type Rubric, type Criterion } from '../services/api';
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

      {/* View/Edit Modal */}
      {viewingRubric && (
        <ViewRubricModal
          rubric={viewingRubric}
          onClose={() => setViewingRubric(null)}
          onUpdate={(updated) => {
            setRubrics(rubrics.map(r => r.id === updated.id ? updated : r));
            setViewingRubric(null);
          }}
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
  const totalPoints = rubric.criteria?.reduce((sum, c) => sum + (c.maxPoints || 0), 0) || 0;
  const hasCriteria = rubric.criteria && rubric.criteria.length > 0;

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
              {hasCriteria ? `${rubric.criteria.length} criteria` : 'Needs parsing'}
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
          {hasCriteria ? `Total: ${totalPoints} points` : 'Text extracted'}
        </span>
        <button
          onClick={onView}
          className="text-indigo-600 hover:text-indigo-700 font-medium"
        >
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
            {uploading ? 'Uploading...' : 'Upload & Parse'}
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
  const [criteria, setCriteria] = useState<Omit<Criterion, 'id'>[]>([
    { name: '', description: '', maxPoints: 10, order: 0 }
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCriterion = () => {
    setCriteria([
      ...criteria,
      { name: '', description: '', maxPoints: 10, order: criteria.length }
    ]);
  };

  const updateCriterion = (index: number, field: keyof Omit<Criterion, 'id'>, value: string | number) => {
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

  const totalPoints = criteria.reduce((sum, c) => sum + (c.maxPoints || 0), 0);

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
              <label className="text-sm font-medium text-gray-700">Criteria</label>
              <span className="text-sm text-gray-500">Total: {totalPoints} points</span>
            </div>
            <div className="space-y-3">
              {criteria.map((criterion, index) => (
                <div key={index} className="flex gap-3 items-start p-4 bg-gray-50 rounded-lg">
                  <GripVertical className="w-5 h-5 text-gray-400 mt-2 cursor-grab" />
                  <div className="flex-1 grid grid-cols-12 gap-3">
                    <input
                      type="text"
                      value={criterion.name}
                      onChange={(e) => updateCriterion(index, 'name', e.target.value)}
                      placeholder="Criterion name"
                      className="col-span-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      value={criterion.description}
                      onChange={(e) => updateCriterion(index, 'description', e.target.value)}
                      placeholder="Description"
                      className="col-span-6 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      value={criterion.maxPoints}
                      onChange={(e) => updateCriterion(index, 'maxPoints', parseInt(e.target.value) || 0)}
                      placeholder="Points"
                      className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center"
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

function ViewRubricModal({ rubric, onClose, onUpdate }: {
  rubric: Rubric;
  onClose: () => void;
  onUpdate: (rubric: Rubric) => void;
}) {
  const [activeTab, setActiveTab] = useState<'criteria' | 'rawText'>('criteria');
  const [name, setName] = useState(rubric.name);
  const [description, setDescription] = useState(rubric.description || '');
  const [criteria, setCriteria] = useState<Omit<Criterion, 'id'>[]>(
    rubric.criteria?.length
      ? rubric.criteria.map(c => ({ name: c.name, description: c.description || '', maxPoints: c.maxPoints, order: c.order }))
      : [{ name: '', description: '', maxPoints: 10, order: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [loadingFull, setLoadingFull] = useState(true);
  const [rawContent, setRawContent] = useState<string>('');

  // Fetch full rubric with rawContent
  useEffect(() => {
    const fetchFull = async () => {
      try {
        const full = await rubricsApi.getById(rubric.id);
        setRawContent((full as any).rawContent || '');
      } catch (err) {
        console.error('Failed to fetch rubric details:', err);
      } finally {
        setLoadingFull(false);
      }
    };
    fetchFull();
  }, [rubric.id]);

  const addCriterion = () => {
    setCriteria([...criteria, { name: '', description: '', maxPoints: 10, order: criteria.length }]);
  };

  const updateCriterion = (index: number, field: string, value: string | number) => {
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
    setSaving(true);
    try {
      const updated = await rubricsApi.update(rubric.id, {
        name,
        description,
        criteria: criteria.filter(c => c.name.trim())
      });
      onUpdate(updated);
    } catch (err) {
      console.error('Failed to update rubric:', err);
    } finally {
      setSaving(false);
    }
  };

  const totalPoints = criteria.reduce((sum, c) => sum + (c.maxPoints || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 w-full"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            className="text-gray-500 text-sm bg-transparent border-none focus:outline-none focus:ring-0 w-full mt-1"
          />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('criteria')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'criteria'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Criteria ({criteria.filter(c => c.name.trim()).length})
            </button>
            <button
              onClick={() => setActiveTab('rawText')}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'rawText'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Extracted Text
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'criteria' ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Rubric Criteria</span>
                <span className="text-sm text-gray-500">Total: {totalPoints} points</span>
              </div>
              <div className="space-y-3">
                {criteria.map((criterion, index) => (
                  <div key={index} className="flex gap-3 items-start p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1 grid grid-cols-12 gap-3">
                      <input
                        type="text"
                        value={criterion.name}
                        onChange={(e) => updateCriterion(index, 'name', e.target.value)}
                        placeholder="Criterion name"
                        className="col-span-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="text"
                        value={criterion.description}
                        onChange={(e) => updateCriterion(index, 'description', e.target.value)}
                        placeholder="Description"
                        className="col-span-6 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        value={criterion.maxPoints}
                        onChange={(e) => updateCriterion(index, 'maxPoints', parseInt(e.target.value) || 0)}
                        placeholder="Points"
                        className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center"
                      />
                    </div>
                    <button
                      onClick={() => removeCriterion(index)}
                      className="text-gray-400 hover:text-red-500 mt-2"
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
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-3">
                This is the text extracted from the uploaded file. Use this to manually create criteria above,
                or wait for AI parsing when available.
              </p>
              {loadingFull ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : rawContent ? (
                <pre className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap font-mono max-h-96 overflow-auto">
                  {rawContent}
                </pre>
              ) : (
                <p className="text-gray-400 italic">No text extracted (rubric was created manually)</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
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
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
