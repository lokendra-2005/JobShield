import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import PrimaryButton from '../components/PrimaryButton';
import InputField from '../components/InputField';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ email: '', password: '' });
    // Renamed from `e` (too short, confusing in the catch block where we also have an error param)
    const [fieldErrors, setFieldErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState('');

    // Client-side validation runs even though the server also validates.
    // Duplicate on purpose — avoids a round trip for obvious mistakes like empty fields.
    // The server is the source of truth for security; this is just UX.
    const validateFormFields = () => {
        const validationErrs = {};
        if (!formData.email) validationErrs.email = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(formData.email)) validationErrs.email = 'That doesn\'t look like a valid email address';
        if (!formData.password) validationErrs.password = 'Password is required';
        return validationErrs;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const validationErrs = validateFormFields();
        if (Object.keys(validationErrs).length) {
            setFieldErrors(validationErrs);
            return;
        }
        setFieldErrors({});
        setServerError('');
        setLoading(true);
        try {
            await login(formData.email, formData.password);
            navigate('/dashboard');
        } catch (loginErr) {
            // The server returns a user-friendly message — prefer it over the generic fallback
            setServerError(loginErr.response?.data?.message || 'Login failed. Please check your credentials and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 relative z-10">
            <div className="fixed inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,119,182,0.12) 0%, transparent 60%)' }} />

            <motion.div initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, type: 'spring', stiffness: 120 }}
                className="w-full max-w-md">

                <div className="glass-card p-8 space-y-6">
                    <div className="text-center space-y-2">
                        <Link to="/" className="inline-block mb-2">
                            <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-2xl"
                                style={{ background: 'linear-gradient(135deg, #0077b6 0%, #005f8a 100%)', boxShadow: '0 0 20px rgba(6,182,212,0.35)' }}>
                                🛡️
                            </div>
                        </Link>
                        <h1 className="font-cyber text-2xl font-bold text-white">Welcome Back</h1>
                        <p className="text-gray-500 text-sm">Sign in to your JobShield account</p>
                    </div>

                    {serverError && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="p-3 rounded-lg border text-sm text-center"
                            style={{ borderColor: 'rgba(239,68,68,0.30)', background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
                            ⚠ {serverError}
                        </motion.div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <InputField
                            label="Email Address"
                            type="email"
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            error={fieldErrors.email}
                        />
                        <InputField
                            label="Password"
                            type="password"
                            placeholder="••••••••"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            error={fieldErrors.password}
                        />

                        <div className="flex justify-end">
                            {/* TODO: implement forgot-password flow — for now it's just a visual placeholder */}
                            <a href="#" className="text-xs transition-colors" style={{ color: '#06B6D4' }}>
                                Forgot password?
                            </a>
                        </div>

                        <PrimaryButton type="submit" loading={loading} className="w-full py-3.5 text-base">
                            🔐 Sign In
                        </PrimaryButton>
                    </form>

                    <p className="text-center text-sm text-gray-500">
                        Don't have an account?{' '}
                        <Link to="/signup" className="font-semibold transition-colors" style={{ color: '#06B6D4' }}>
                            Create one →
                        </Link>
                    </p>
                </div>

                <div className="text-center mt-4">
                    <Link to="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
                        ← Back to Home
                    </Link>
                </div>
            </motion.div>
        </div>
    );
}
