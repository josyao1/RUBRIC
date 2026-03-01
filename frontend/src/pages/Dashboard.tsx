/**
 * Dashboard — Main dashboard with stats, recent activity, and quick actions
 *
 * Displays summary stat cards (rubrics, assignments, submissions, students),
 * recent assignments with join codes, and quick-action buttons.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Users, BookOpen, Loader2, Copy, Check } from 'lucide-react';
import { rubricsApi, assignmentsApi, studentsApi, type Assignment } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface DashboardStats {
  totalRubrics: number;
  totalAssignments: number;
  totalStudents: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [rubrics, assignments, students] = await Promise.all([
        rubricsApi.getAll(),
        assignmentsApi.getAll(),
        studentsApi.getAll(),
      ]);

      setStats({
        totalRubrics: rubrics.length,
        totalAssignments: assignments.length,
        totalStudents: students.length,
      });

      setRecentAssignments(assignments.slice(0, 5));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyJoinCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-forest-600" />
          <span className="ml-3 text-gray-600">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Rubrics', value: stats?.totalRubrics || 0, icon: FileText, border: 'border-l-forest-500', href: '/teacher/rubrics' },
    { label: 'Assignments', value: stats?.totalAssignments || 0, icon: BookOpen, border: 'border-l-forest-700', href: '/teacher/assignments' },
    { label: 'Students', value: stats?.totalStudents || 0, icon: Users, border: 'border-l-forest-400', href: '/teacher/assignments' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-semibold text-gray-900">Welcome back, {user?.name || 'Teacher'}</h1>
        <p className="text-gray-500 mt-1">Here's an overview of your work.</p>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            to={stat.href}
            className={`bg-white rounded-lg border border-gray-200 border-l-4 ${stat.border} p-5 hover:shadow-sm transition-all`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <stat.icon className="w-5 h-5 text-gray-400" />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Assignments */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Assignments</h2>
            <Link to="/teacher/assignments" className="text-sm text-forest-600 hover:text-forest-700">
              View all →
            </Link>
          </div>
          {recentAssignments.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <BookOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>No assignments yet</p>
              <Link to="/teacher/assignments" className="text-forest-600 text-sm hover:underline">
                Create your first assignment
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAssignments.map((assignment) => (
                <Link
                  key={assignment.id}
                  to="/teacher/assignments"
                  className="flex items-center justify-between p-3 bg-surface-warm rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{assignment.name}</p>
                      <p className="text-xs text-gray-500">
                        {assignment.submissionCount} submission{assignment.submissionCount !== 1 ? 's' : ''}
                        {assignment.rubricName && ` • ${assignment.rubricName}`}
                      </p>
                    </div>
                  </div>
                  {assignment.joinCode && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        copyJoinCode(assignment.joinCode!);
                      }}
                      className="flex items-center gap-1.5 ml-3 px-2.5 py-1 bg-white border border-gray-200 rounded text-xs font-mono font-semibold text-gray-700 hover:border-forest-400 hover:text-forest-700 transition-colors flex-shrink-0"
                      title="Copy join code"
                    >
                      {copiedCode === assignment.joinCode ? (
                        <Check className="w-3 h-3 text-green-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {assignment.joinCode}
                    </button>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to="/teacher/rubrics"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-forest-300 hover:bg-forest-50 transition-colors"
            >
              <FileText className="w-8 h-8 text-forest-600" />
              <div className="ml-4">
                <p className="font-medium text-gray-900">Create Rubric</p>
                <p className="text-sm text-gray-500">Define feedback criteria</p>
              </div>
            </Link>
            <Link
              to="/teacher/assignments"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-forest-300 hover:bg-forest-50 transition-colors"
            >
              <BookOpen className="w-8 h-8 text-forest-600" />
              <div className="ml-4">
                <p className="font-medium text-gray-900">New Assignment</p>
                <p className="text-sm text-gray-500">Create and share a join code with students</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
