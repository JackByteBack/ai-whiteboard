import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import NeonAuthGate, { NeonAuthPage } from './components/NeonAuthGate'
import { ProtectedRoute, PublicOnlyRoute } from './routes/ProtectedRoute'
import { neonEnabled } from './lib/neonAuth'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import WhiteboardPage from './pages/WhiteboardPage'
import NotFound from './pages/NotFound'
import Login from './pages/Login'
import Register from './pages/Register'

// TODO(later chapters): wire the dashboard / board pages and account routes.
// Auth is handled by Neon Auth UI at /auth/:pathname when neonEnabled.

export default function App() {
  return (
    <BrowserRouter>
      <NeonAuthGate>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />

            {neonEnabled ? (
              <>
                <Route path="/login" element={<Navigate replace to="/auth/sign-in" />} />
                <Route path="/register" element={<Navigate replace to="/auth/sign-up" />} />
                <Route
                  path="/auth/:pathname"
                  element={
                    <PublicOnlyRoute>
                      <NeonAuthPage />
                    </PublicOnlyRoute>
                  }
                />
              </>
            ) : (
              <>
                <Route
                  path="/login"
                  element={
                    <PublicOnlyRoute>
                      <Login />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <PublicOnlyRoute>
                      <Register />
                    </PublicOnlyRoute>
                  }
                />
              </>
            )}

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/board/:boardId"
              element={
                <ProtectedRoute>
                  <WhiteboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>

          <Toaster
            position="bottom-center"
            toastOptions={{
              style: {
                background: '#fff',
                color: '#16161d',
                border: '1px solid #e9e8f3',
                borderRadius: '999px',
                padding: '.6rem 1rem',
                boxShadow: '0 8px 24px rgba(28,27,64,.08), 0 2px 6px rgba(28,27,64,.04)',
                fontSize: '.875rem',
                fontWeight: 500,
              },
              success: { iconTheme: { primary: '#2f8159', secondary: '#fff' } },
              error: { iconTheme: { primary: '#e11d48', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </NeonAuthGate>
    </BrowserRouter>
  )
}
