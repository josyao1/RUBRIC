import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
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
  { to: '/students', icon: Users, label: 'Students' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user } = useAuth();

  return (
    <div className="flex h-screen bg-surface">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <MessageSquare className="w-7 h-7 text-accent-400" />
          <span className="ml-3 text-xl font-serif font-semibold text-white/90">FeedbackLab</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white border-l-2 border-accent-400'
                    : 'text-white/60 hover:bg-white/5 hover:text-white/80 border-l-2 border-transparent'
                }`
              }
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center">
            <div className="w-9 h-9 rounded-full bg-forest-700 flex items-center justify-center">
              <span className="text-forest-100 font-medium text-sm">
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white/90">{user?.name || 'User'}</p>
              <p className="text-xs text-white/50">{user?.email || ''}</p>
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
