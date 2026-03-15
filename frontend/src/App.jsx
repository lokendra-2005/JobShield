import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import Dashboard from './pages/Dashboard';
import Background from './components/Background';

function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-cyber-black">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner" style={{ width: 48, height: 48 }} />
                    <p className="font-cyber text-sm tracking-widest" style={{ color: '#06B6D4' }}>INITIALIZING...</p>
                </div>
            </div>
        );
    }
    return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) return null;
    return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <div className="relative min-h-screen">
                    <Background />
                    <div className="scan-overlay" />
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                        <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
                        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </BrowserRouter>
        </AuthProvider>
    );
}
