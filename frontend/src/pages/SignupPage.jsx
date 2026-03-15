import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import PrimaryButton from "../components/PrimaryButton";
import InputField from '../components/InputField';

// Scores password strength on a 0–5 scale.
// Rules: length>=8, uppercase, digit, special char, length>=12
// Not using zxcvbn because it's 400kb and we only need a visual strength bar, not actual entropy analysis.
function scorePasswordStrength(passwordValue) {
    if (!passwordValue) return { score: 0, label: '', color: '' };
    let strengthScore = 0;
    if (passwordValue.length >= 8) strengthScore++;
    if (/[A-Z]/.test(passwordValue)) strengthScore++;
    if (/[0-9]/.test(passwordValue)) strengthScore++;
    if (/[^A-Za-z0-9]/.test(passwordValue)) strengthScore++;
    if (passwordValue.length >= 12) strengthScore++;

    // console.log('DEBUG: password strength scored', strengthScore); // left from debugging
    const strengthMap = [
        { label: '', color: '' },
        { label: 'Very Weak', color: '#EF4444' },
        { label: 'Weak', color: '#f97316' },
        { label: 'Fair', color: '#f59e0b' },
        { label: 'Strong', color: '#22c55e' },
        { label: 'Very Strong', color: '#16a34a' },
    ];
    return { score: strengthScore, ...strengthMap[strengthScore] };
}

export default function SignupPage() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ username: '', email: '', password: '', confirm: '' });
    const [fieldErrors, setFieldErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [serverError, setServerError] = useState('');

    const pwdStrength = scorePasswordStrength(formData.password);

    // Same dual-validation pattern as LoginPage — client catches obvious mistakes,
    // server is the authority for business rules (duplicate email etc.)
    const validateFormFields = () => {
        const validationErrs = {};
        if (!formData.username || formData.username.length < 3)
            validationErrs.username = 'Username must be at least 3 characters';
        if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email))
            validationErrs.email = 'Valid email address is required';
        if (!formData.password || formData.password.length < 6)
            validationErrs.password = 'Password must be at least 6 characters';
        if (formData.password !== formData.confirm)
            validationErrs.confirm = 'Passwords don\'t match — please re-enter';
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
            await register(formData.username, formData.email, formData.password);
            navigate('/dashboard');
        } catch (registrationErr) {
            setServerError(registrationErr.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-12 relative z-10">
            <div className="fixed inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(0,119,182,0.12) 0%, transparent 60%)' }} />

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
                        <h1 className="font-cyber text-2xl font-bold text-white">Create Account</h1>
                        <p className="text-gray-500 text-sm">Join 200,000+ protected job seekers</p>
                    </div>

                    {serverError && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="p-3 rounded-lg border text-sm text-center"
                            style={{ borderColor: 'rgba(239,68,68,0.30)', background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
                            ⚠ {serverError}
                        </motion.div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                        <InputField label="Username" type="text" placeholder="cybershield_user"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            error={fieldErrors.username} />

                        <InputField label="Email Address" type="email" placeholder="you@example.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            error={fieldErrors.email} />

                        <div className="space-y-2">
                            <InputField label="Password" type="password" placeholder="Min. 6 characters"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                error={fieldErrors.password} />

                            {/* Password strength visual indicator */}
                            {formData.password && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5">
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((barIndex) => (
                                            <div key={barIndex} className="strength-bar"
                                                style={{ background: barIndex <= pwdStrength.score ? pwdStrength.color : 'rgba(255,255,255,0.08)' }} />
                                        ))}
                                    </div>
                                    <p className="text-xs font-medium" style={{ color: pwdStrength.color || '#6b7280' }}>
                                        {pwdStrength.label}
                                    </p>
                                </motion.div>
                            )}
                        </div>

                        <InputField label="Confirm Password" type="password" placeholder="Repeat your password"
                            value={formData.confirm}
                            onChange={(e) => setFormData({ ...formData, confirm: e.target.value })}
                            error={fieldErrors.confirm} />

                        <PrimaryButton type="submit" loading={loading} className="w-full py-3.5 text-base">
                            🛡️ Create My Shield
                        </PrimaryButton>
                    </form>

                    <p className="text-center text-sm text-gray-500">
                        Already have an account?{' '}
                        <Link to="/login" className="font-semibold transition-colors" style={{ color: '#06B6D4' }}>
                            Sign in →
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
