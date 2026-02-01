import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Upload,
  Settings,
  BookOpen,
  MessageSquare,
  Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/rubrics', icon: FileText, label: 'Rubrics' },
  { to: '/assignments', icon: BookOpen, label: 'Assignments' },
  { to: '/submissions', icon: Upload, label: 'Submissions' },
  { to: '/students', icon: Users, label: 'Students' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <MessageSquare className="w-8 h-8 text-indigo-600" />
          <span className="ml-3 text-xl font-bold text-gray-900">FeedbackLab</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <span className="text-indigo-600 font-medium">
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-500">{user?.email || ''}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
