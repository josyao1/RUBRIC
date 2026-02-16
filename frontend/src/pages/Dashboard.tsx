import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, Upload, CheckCircle, Clock, Users, BookOpen,
  Loader2, Send
} from 'lucide-react';
import {
  rubricsApi, assignmentsApi, submissionsApi, studentsApi,
  type Assignment
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface DashboardStats {
  totalRubrics: number;
  totalAssignments: number;
  totalSubmissions: number;
  totalStudents: number;
  pendingGrading: number;
  gradedSubmissions: number;
  feedbackReleased: number;
  inProgressAssignments: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [rubrics, assignments, submissions, students] = await Promise.all([
        rubricsApi.getAll(),
        assignmentsApi.getAll(),
        submissionsApi.getAll(),
        studentsApi.getAll()
      ]);

      const pendingGrading = submissions.filter(s => s.status === 'pending').length;
      const gradedSubmissions = submissions.filter(s => s.status === 'ready' || s.status === 'reviewed').length;
      const feedbackReleased = submissions.filter(s => (s as any).feedbackReleased).length;
      const inProgressAssignments = assignments.filter(a => a.gradingStatus === 'in_progress').length;

      setStats({
        totalRubrics: rubrics.length,
        totalAssignments: assignments.length,
        totalSubmissions: submissions.length,
        totalStudents: students.length,
        pendingGrading,
        gradedSubmissions,
        feedbackReleased,
        inProgressAssignments
      });

      setRecentAssignments(assignments.slice(0, 3));
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
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
    { label: 'Rubrics', value: stats?.totalRubrics || 0, icon: FileText, border: 'border-l-forest-500', href: '/rubrics' },
    { label: 'Assignments', value: stats?.totalAssignments || 0, icon: BookOpen, border: 'border-l-forest-700', href: '/assignments' },
    { label: 'Submissions', value: stats?.totalSubmissions || 0, icon: Upload, border: 'border-l-accent-500', href: '/assignments' },
    { label: 'Students', value: stats?.totalStudents || 0, icon: Users, border: 'border-l-forest-400', href: '/students' },
  ];

  const feedbackStats = [
    { label: 'Feedback Ready', value: stats?.gradedSubmissions || 0, icon: CheckCircle, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Pending', value: stats?.pendingGrading || 0, icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Released', value: stats?.feedbackReleased || 0, icon: Send, color: 'text-forest-700', bg: 'bg-forest-50' },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-serif font-semibold text-gray-900">Welcome back, {user?.name || 'Teacher'}</h1>
        <p className="text-gray-500 mt-1">Here's an overview of your work.</p>
      </div>

      {/* In Progress Alert */}
      {stats && stats.inProgressAssignments > 0 && (
        <div className="mb-6 p-4 bg-forest-50 border border-forest-200 rounded-lg flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-forest-600 animate-spin" />
          <p className="text-forest-800">
            <span className="font-medium">{stats.inProgressAssignments} assignment{stats.inProgressAssignments !== 1 ? 's' : ''}</span> currently generating feedback...
          </p>
          <Link to="/assignments" className="ml-auto text-forest-700 hover:text-forest-800 text-sm font-medium">
            View Progress →
          </Link>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

      {/* Feedback Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Feedback Status</h2>
        <div className="grid grid-cols-3 gap-4">
          {feedbackStats.map((stat) => (
            <div key={stat.label} className={`${stat.bg} rounded-lg p-4 text-center`}>
              <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} />
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className={`text-sm ${stat.color}`}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Assignments */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Assignments</h2>
            <Link to="/assignments" className="text-sm text-forest-600 hover:text-forest-700">
              View all →
            </Link>
          </div>
          {recentAssignments.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <BookOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>No assignments yet</p>
              <Link to="/assignments" className="text-forest-600 text-sm hover:underline">
                Create your first assignment
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-3 bg-surface-warm rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{assignment.name}</p>
                      <p className="text-xs text-gray-500">
                        {assignment.submissionCount} submission{assignment.submissionCount !== 1 ? 's' : ''}
                        {assignment.rubricName && ` • ${assignment.rubricName}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {assignment.gradingStatus === 'in_progress' && (
                      <span className="flex items-center gap-1 text-xs text-forest-600">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating
                      </span>
                    )}
                    {assignment.gradingStatus === 'completed' && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        Done
                      </span>
                    )}
                    {assignment.gradingStatus === 'idle' && assignment.submissionCount > 0 && assignment.rubricName && (
                      <span className="flex items-center gap-1 text-xs text-amber-600">
                        <Clock className="w-3 h-3" />
                        Ready
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to="/rubrics"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-forest-300 hover:bg-forest-50 transition-colors"
            >
              <FileText className="w-8 h-8 text-forest-600" />
              <div className="ml-4">
                <p className="font-medium text-gray-900">Create Rubric</p>
                <p className="text-sm text-gray-500">Define feedback criteria</p>
              </div>
            </Link>
            <Link
              to="/assignments"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-forest-300 hover:bg-forest-50 transition-colors"
            >
              <BookOpen className="w-8 h-8 text-forest-600" />
              <div className="ml-4">
                <p className="font-medium text-gray-900">New Assignment</p>
                <p className="text-sm text-gray-500">Create and link to rubric</p>
              </div>
            </Link>
            <Link
              to="/assignments"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-forest-300 hover:bg-forest-50 transition-colors"
            >
              <Upload className="w-8 h-8 text-forest-600" />
              <div className="ml-4">
                <p className="font-medium text-gray-900">Upload Submissions</p>
                <p className="text-sm text-gray-500">Open an assignment and upload work</p>
              </div>
            </Link>
            <Link
              to="/students"
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-forest-300 hover:bg-forest-50 transition-colors"
            >
              <Send className="w-8 h-8 text-forest-600" />
              <div className="ml-4">
                <p className="font-medium text-gray-900">Release Feedback</p>
                <p className="text-sm text-gray-500">Share feedback with students</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
