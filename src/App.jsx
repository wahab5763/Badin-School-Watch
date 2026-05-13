import React, { Suspense, lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';

const LandingPage = lazy(() => import('./routes/LandingPage'));
const DashboardPage = lazy(() => import('./routes/DashboardPage'));

function ScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#ECF2F6] text-slatebrand">
      <div className="rounded-full border border-slatebrand/10 bg-white px-6 py-3 text-sm font-medium shadow-soft">Loading…</div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, showLogin } = useAuth();
  if (!isAuthenticated) {
    return showLogin ? <Login /> : <ScreenLoader />;
  }
  return children;
}

function AppContent() {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
