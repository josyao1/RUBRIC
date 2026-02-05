import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Rubrics from './pages/Rubrics';
import Assignments from './pages/Assignments';
import Students from './pages/Students';
import StudentFeedback from './pages/StudentFeedback';
import Settings from './pages/Settings';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public route for students to view feedback */}
          <Route path="/feedback/:token" element={<StudentFeedback />} />

          {/* Teacher routes with layout */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="rubrics" element={<Rubrics />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="students" element={<Students />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
