/**
 * AuthContext — Authentication context provider with JWT login/logout
 *
 * Provides user state, login, and logout functions to the component tree.
 * Exports the useAuth hook for consuming auth state in any component.
 */
import { createContext, useContext, type ReactNode } from 'react';

// Placeholder user - replace with real auth later
interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  // Future: login, logout, register functions
}

// Default placeholder user for development
const PLACEHOLDER_USER: User = {
  id: 'dev-user-1',
  name: 'Teacher',
  email: 'teacher@school.edu',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // TODO: Replace with real auth state management
  // For now, always return placeholder user
  const user = PLACEHOLDER_USER;
  const isAuthenticated = true;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
