import { useState } from 'react';
import { User, MessageSquare, Palette, Database, Save, Loader2, CheckCircle, Trash2, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Settings() {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile
  const [teacherName, setTeacherName] = useState(user?.name || '');
  const [institution, setInstitution] = useState('');

  // Feedback preferences
  const [feedbackTone, setFeedbackTone] = useState('balanced');
  const [defaultInstructions, setDefaultInstructions] = useState('');

  // Student portal
  const [portalWelcome, setPortalWelcome] = useState('Here is your personalized feedback. Take time to review each section carefully.');

  const handleSave = async () => {
    setSaving(true);
    // Simulate save - in a real app, this would save to backend
    await new Promise(resolve => setTimeout(resolve, 500));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExportData = () => {
    // In a real app, this would trigger a data export
    alert('Data export functionality coming soon. This will allow you to download all your rubrics, assignments, and feedback.');
  };

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      alert('Data clearing functionality coming soon.');
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Configure your FeedbackLab preferences</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Teacher Profile */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <User className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Teacher Profile</h2>
              <p className="text-sm text-gray-500">Your information shown to students</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="Dr. Smith"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">This will appear on student feedback pages</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School / Institution</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="Springfield High School"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Feedback Preferences */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Feedback Preferences</h2>
              <p className="text-sm text-gray-500">Default settings for AI-generated feedback</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Feedback Tone</label>
              <select
                value={feedbackTone}
                onChange={(e) => setFeedbackTone(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="encouraging">Encouraging - Focus on growth and positives</option>
                <option value="balanced">Balanced - Mix of praise and constructive criticism</option>
                <option value="direct">Direct - Straightforward, focus on improvements</option>
                <option value="rigorous">Rigorous - High standards, detailed critique</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Instructions for AI
              </label>
              <textarea
                value={defaultInstructions}
                onChange={(e) => setDefaultInstructions(e.target.value)}
                placeholder="Add any default instructions that should apply to all feedback generation...&#10;&#10;Example: Focus on thesis clarity and evidence quality. Be encouraging with first-year students."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 h-24 resize-none text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                These will be pre-filled when starting grading (can be edited per assignment)
              </p>
            </div>
          </div>
        </div>

        {/* Student Portal */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Palette className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Student Portal</h2>
              <p className="text-sm text-gray-500">Customize the feedback view for students</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Welcome Message
              </label>
              <textarea
                value={portalWelcome}
                onChange={(e) => setPortalWelcome(e.target.value)}
                placeholder="Message shown at the top of student feedback pages..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 h-20 resize-none text-sm"
              />
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Database className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Data Management</h2>
              <p className="text-sm text-gray-500">Export or clear your data</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportData}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Download className="w-4 h-4 mr-2 text-gray-500" />
              Export All Data
            </button>
            <button
              onClick={handleClearData}
              className="flex items-center px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Data
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Export includes all rubrics, assignments, submissions, and generated feedback.
          </p>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Settings
              </>
            )}
          </button>
          {saved && (
            <span className="flex items-center text-green-600 text-sm">
              <CheckCircle className="w-4 h-4 mr-1" />
              Settings saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
