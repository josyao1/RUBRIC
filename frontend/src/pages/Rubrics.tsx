import { useState, useCallback } from 'react';
import { Plus, Upload, FileText, Trash2, GripVertical } from 'lucide-react';
import type { Rubric, Criterion } from '../types';

// Mock data for now
const mockRubrics: Rubric[] = [];

export default function Rubrics() {
  const [rubrics, setRubrics] = useState<Rubric[]>(mockRubrics);
  const [showBuilder, setShowBuilder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rubrics</h1>
          <p className="text-gray-600 mt-1">Manage your grading rubrics</p>
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

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onUpload={(rubric) => {
          setRubrics([...rubrics, rubric]);
          setShowUpload(false);
        }} />
      )}

      {/* Builder Modal */}
      {showBuilder && (
        <BuilderModal onClose={() => setShowBuilder(false)} onSave={(rubric) => {
          setRubrics([...rubrics, rubric]);
          setShowBuilder(false);
        }} />
      )}

      {/* Rubrics List */}
      {rubrics.length === 0 ? (
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rubrics.map((rubric) => (
            <RubricCard key={rubric.id} rubric={rubric} onDelete={() => {
              setRubrics(rubrics.filter(r => r.id !== rubric.id));
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function RubricCard({ rubric, onDelete }: { rubric: Rubric; onDelete: () => void }) {
  const totalPoints = rubric.criteria.reduce((sum, c) => sum + c.maxPoints, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="ml-3">
            <h3 className="font-semibold text-gray-900">{rubric.name}</h3>
            <p className="text-sm text-gray-500">{rubric.criteria.length} criteria</p>
          </div>
        </div>
        <button onClick={onDelete} className="text-gray-400 hover:text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{rubric.description || 'No description'}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Total: {totalPoints} points</span>
        <button className="text-indigo-600 hover:text-indigo-700 font-medium">View</button>
      </div>
    </div>
  );
}

function UploadModal({ onClose, onUpload }: { onClose: () => void; onUpload: (rubric: Rubric) => void }) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://localhost:3001/api/rubrics/upload', {
        method: 'POST',
        body: formData,
      });
      const rubric = await response.json();
      onUpload(rubric);
    } catch (error) {
      console.error('Upload failed:', error);
      // For now, create a mock rubric
      onUpload({
        id: Date.now().toString(),
        name: file.name.replace(/\.[^/.]+$/, ''),
        description: 'Uploaded rubric (parsing pending)',
        criteria: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Upload Rubric</h2>

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
              <p className="text-sm text-gray-500 mb-4">Supports PDF, DOCX, XLSX, CSV</p>
              <label className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
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
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading...' : 'Upload & Parse'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BuilderModal({ onClose, onSave }: { onClose: () => void; onSave: (rubric: Rubric) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [criteria, setCriteria] = useState<Criterion[]>([
    { id: '1', name: '', description: '', maxPoints: 10, order: 0 }
  ]);

  const addCriterion = () => {
    setCriteria([
      ...criteria,
      { id: Date.now().toString(), name: '', description: '', maxPoints: 10, order: criteria.length }
    ]);
  };

  const updateCriterion = (id: string, field: keyof Criterion, value: string | number) => {
    setCriteria(criteria.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeCriterion = (id: string) => {
    if (criteria.length > 1) {
      setCriteria(criteria.filter(c => c.id !== id));
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: Date.now().toString(),
      name,
      description,
      criteria: criteria.filter(c => c.name.trim()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const totalPoints = criteria.reduce((sum, c) => sum + (c.maxPoints || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Create Rubric</h2>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Basic Info */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rubric Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Essay Grading Rubric"
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
                <div key={criterion.id} className="flex gap-3 items-start p-4 bg-gray-50 rounded-lg">
                  <GripVertical className="w-5 h-5 text-gray-400 mt-2 cursor-grab" />
                  <div className="flex-1 grid grid-cols-12 gap-3">
                    <input
                      type="text"
                      value={criterion.name}
                      onChange={(e) => updateCriterion(criterion.id, 'name', e.target.value)}
                      placeholder="Criterion name"
                      className="col-span-4 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      value={criterion.description}
                      onChange={(e) => updateCriterion(criterion.id, 'description', e.target.value)}
                      placeholder="Description"
                      className="col-span-6 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      value={criterion.maxPoints}
                      onChange={(e) => updateCriterion(criterion.id, 'maxPoints', parseInt(e.target.value) || 0)}
                      placeholder="Points"
                      className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center"
                    />
                  </div>
                  <button
                    onClick={() => removeCriterion(criterion.id)}
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
            disabled={!name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            Save Rubric
          </button>
        </div>
      </div>
    </div>
  );
}
