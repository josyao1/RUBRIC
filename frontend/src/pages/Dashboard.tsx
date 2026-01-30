import { FileText, Upload, CheckCircle, Clock } from 'lucide-react';

const stats = [
  { label: 'Total Rubrics', value: '0', icon: FileText, color: 'bg-blue-500' },
  { label: 'Pending Grading', value: '0', icon: Clock, color: 'bg-yellow-500' },
  { label: 'Graded', value: '0', icon: CheckCircle, color: 'bg-green-500' },
  { label: 'Submissions', value: '0', icon: Upload, color: 'bg-purple-500' },
];

export default function Dashboard() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back! Here's an overview of your grading.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/rubrics"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
          >
            <FileText className="w-8 h-8 text-indigo-600" />
            <div className="ml-4">
              <p className="font-medium text-gray-900">Upload Rubric</p>
              <p className="text-sm text-gray-500">Import an existing rubric</p>
            </div>
          </a>
          <a
            href="/submissions"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
          >
            <Upload className="w-8 h-8 text-indigo-600" />
            <div className="ml-4">
              <p className="font-medium text-gray-900">Upload Submissions</p>
              <p className="text-sm text-gray-500">Add student work</p>
            </div>
          </a>
          <a
            href="/grades"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
          >
            <CheckCircle className="w-8 h-8 text-indigo-600" />
            <div className="ml-4">
              <p className="font-medium text-gray-900">Review Grades</p>
              <p className="text-sm text-gray-500">Check AI-graded work</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
