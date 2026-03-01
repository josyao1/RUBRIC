/**
 * App — Top-level routing
 *
 * Teacher routes live under /teacher with a sidebar layout.
 * Student portal lives under /student (no sidebar).
 * Magic links at /feedback/:token remain unchanged.
 * Root redirects to /teacher.
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Rubrics from './pages/Rubrics';
import Assignments from './pages/Assignments';
import StudentFeedback from './pages/StudentFeedback';
import Settings from './pages/Settings';
import StudentPortal from './pages/StudentPortal';
import StudentWorkspace from './pages/StudentWorkspace';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Backwards-compat magic links */}
          <Route path="/feedback/:token" element={<StudentFeedback />} />

          {/* Student portal — no sidebar */}
          <Route path="/student" element={<StudentPortal />} />
          <Route path="/student/:code" element={<StudentPortal />} />
          <Route path="/student/:code/:studentId" element={<StudentWorkspace />} />

          {/* Teacher routes with sidebar */}
          <Route path="/teacher" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="rubrics" element={<Rubrics />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/teacher" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
