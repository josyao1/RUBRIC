import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Rubrics from './pages/Rubrics';
import Assignments from './pages/Assignments';
import Submissions from './pages/Submissions';
import FeedbackReview from './pages/FeedbackReview';
import Settings from './pages/Settings';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="rubrics" element={<Rubrics />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="submissions" element={<Submissions />} />
            <Route path="feedback" element={<FeedbackReview />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
