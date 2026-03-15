import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Card from "../components/Card";
import PrimaryButton from "../components/PrimaryButton";
import CounterStat from '../components/CounterStat';

const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: (i = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, delay: i * 0.15, ease: [0.25, 0.46, 0.45, 0.94] },
    }),
};

const FEATURES = [
    {
        icon: '📄',
        title: 'Resume Analyzer',
        desc: 'Upload your resume and get instant AI feedback on vulnerabilities, gaps, and optimization tips for job safety.',
        badge: 'AI POWERED',
    },
    {
        icon: '🔍',
        title: 'Fake Job Detection',
        desc: 'Paste a job description and our intelligent engine scans for 24+ scam indicators and red flags in real time.',
        badge: 'REAL-TIME',
    },
    {
        icon: '🛡️',
        title: 'Scam Risk Score',
        desc: 'Get a precision risk score from 0–100 with color-coded threat levels and detailed recommendations.',
        badge: 'PRECISION',
    },
];

const HOW_IT_WORKS = [
    { step: '01', title: 'Upload or Paste', desc: 'Upload your resume or paste a suspicious job posting into our system.' },
    { step: '02', title: 'AI Analysis', desc: 'Our engine scans for 24+ scam markers, missing details, and red flags instantly.' },
    { step: '03', title: 'Risk Score', desc: 'Receive a detailed threat report with actionable safety recommendations.' },
];

const STATS = [
    { value: 50000, suffix: '+', label: 'Fake Jobs Detected' },
    { value: 200000, suffix: '+', label: 'Resumes Analyzed' },
    { value: 98, suffix: '%', label: 'Detection Accuracy' },
    { value: 120, suffix: '+', label: 'Countries Protected' },
];

export default function LandingPage() {
    return (
        <div className="relative z-10 min-h-screen">
            {/* ── NAVBAR ── */}
            <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
                style={{ background: 'rgba(2,10,24,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(6,182,212,0.10)' }}>
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                            style={{ background: 'linear-gradient(135deg, #0077b6 0%, #005f8a 100%)', boxShadow: '0 0 12px rgba(6,182,212,0.35)' }}>
                            🛡️
                        </div>
                        <span className="font-cyber text-white font-bold text-lg tracking-wider">JobShield</span>
                    </div>
                    <div className="hidden md:flex items-center gap-8">
                        {['Features', 'How It Works', 'Stats'].map((item) => (
                            <a key={item} href={`#${item.toLowerCase().replace(' ', '-')}`}
                                className="text-gray-400 hover:text-cyan-400 text-sm font-medium transition-colors duration-200">
                                {item}
                            </a>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <Link to="/login">
                            <PrimaryButton variant="outline" className="text-xs py-2 px-4">Sign In</PrimaryButton>
                        </Link>
                        <Link to="/signup">
                            <PrimaryButton className="text-xs py-2 px-4">Get Started</PrimaryButton>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── HERO SECTION ── */}
            <section className="min-h-screen flex items-center justify-center px-6 pt-24 pb-16">
                <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
                    {/* Left content */}
                    <div className="space-y-8">
                        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border"
                                style={{ color: '#06B6D4', borderColor: 'rgba(6,182,212,0.25)', background: 'rgba(6,182,212,0.06)' }}>
                                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#06B6D4' }} />
                                AI THREAT INTELLIGENCE ACTIVE
                            </span>
                        </motion.div>

                        <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1}
                            className="font-cyber text-5xl lg:text-6xl font-black leading-tight">
                            <span className="text-white">AI Powered</span>
                            <br />
                            <span className="text-glow" style={{ color: '#06B6D4' }}>Protection</span>
                            <br />
                            <span className="text-white">Against Fake Jobs</span>
                        </motion.h1>

                        <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2}
                            className="text-gray-400 text-lg leading-relaxed max-w-xl">
                            JobShield uses advanced AI to detect fraudulent job postings, analyze resumes for vulnerabilities,
                            and give you a real-time <span className="font-semibold" style={{ color: '#06B6D4' }}>scam risk score</span> before
                            you share a single detail.
                        </motion.p>

                        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3}
                            className="flex flex-wrap gap-4">
                            <Link to="/signup">
                                <PrimaryButton className="text-base px-8 py-4">
                                    🛡️ Start Protecting Yourself
                                </PrimaryButton>
                            </Link>
                            <Link to="/login">
                                <PrimaryButton variant="outline" className="text-base px-8 py-4">
                                    Sign In →
                                </PrimaryButton>
                            </Link>
                        </motion.div>

                        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4}
                            className="flex items-center gap-6 text-xs text-gray-500">
                            <span className="flex items-center gap-2"><span className="text-green-500">✓</span> Free to use</span>
                            <span className="flex items-center gap-2"><span className="text-green-500">✓</span> No credit card</span>
                            <span className="flex items-center gap-2"><span className="text-green-500">✓</span> Instant results</span>
                        </motion.div>
                    </div>

                    {/* Right — Shield illustration */}
                    <motion.div initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.3, type: 'spring', stiffness: 120 }}
                        className="flex justify-center">
                        <div className="relative">
                            {/* Outer glow rings */}
                            <div className="absolute inset-0 rounded-full" style={{
                                background: 'radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)',
                                width: 400, height: 400, left: '50%', top: '50%',
                                transform: 'translate(-50%, -50%)',
                            }} />
                            {/* Shield */}
                            <div className="shield-float relative z-10 flex items-center justify-center"
                                style={{ width: 280, height: 280 }}>
                                <svg viewBox="0 0 200 220" fill="none" xmlns="http://www.w3.org/2000/svg"
                                    style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 0 30px rgba(6,182,212,0.45))' }}>
                                    <path d="M100 10L20 45V100C20 150 60 190 100 210C140 190 180 150 180 100V45L100 10Z"
                                        fill="url(#shieldGrad)" stroke="rgba(6,182,212,0.55)" strokeWidth="1.5" />
                                    <path d="M100 30L40 58V100C40 140 68 172 100 190C132 172 160 140 160 100V58L100 30Z"
                                        fill="rgba(6,182,212,0.07)" stroke="rgba(6,182,212,0.28)" strokeWidth="1" />
                                    <text x="100" y="120" textAnchor="middle" fontSize="50" fill="rgba(6,182,212,0.9)">🛡</text>
                                    <defs>
                                        <linearGradient id="shieldGrad" x1="100" y1="10" x2="100" y2="210" gradientUnits="userSpaceOnUse">
                                            <stop offset="0%" stopColor="rgba(0,119,182,0.7)" />
                                            <stop offset="100%" stopColor="rgba(2,10,24,0.95)" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                            </div>

                            {/* Floating badges */}
                            {[
                                { label: '98% Accuracy', pos: '-top-4 -left-8', delay: 0.5 },
                                { label: 'Real-time Scan', pos: '-bottom-4 -right-8', delay: 0.7 },
                                { label: '50K+ Threats', pos: 'top-1/2 -right-16', delay: 0.9 },
                            ].map(({ label, pos, delay }) => (
                                <motion.div key={label}
                                    initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay, type: 'spring' }}
                                    className={`absolute ${pos} glass-card px-3 py-1.5 text-xs font-semibold whitespace-nowrap`} style={{ color: '#06B6D4' }}>
                                    ⚡ {label}
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ── FEATURES SECTION ── */}
            <section id="features" className="py-24 px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div variants={fadeUp} initial="hidden" whileInView="visible"
                        viewport={{ once: true }} className="text-center mb-16 space-y-4">
                        <span className="text-sm font-semibold tracking-widest uppercase font-cyber" style={{ color: '#06B6D4' }}>Capabilities</span>
                        <h2 className="font-cyber text-4xl font-bold text-white">
                            Military-Grade <span style={{ color: '#06B6D4' }}>Job Protection</span>
                        </h2>
                        <p className="text-gray-400 max-w-2xl mx-auto">
                            Three powerful modules working in concert to keep you safe from job scams.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {FEATURES.map((f, i) => (
                            <Card key={f.title} delay={i * 0.15} className="relative overflow-hidden">
                                <div className="absolute top-3 right-3">
                                    <span className="text-xs font-cyber font-bold px-2 py-1 rounded-full border"
                                        style={{ color: '#06B6D4', background: 'rgba(6,182,212,0.10)', borderColor: 'rgba(6,182,212,0.22)' }}>
                                        {f.badge}
                                    </span>
                                </div>
                                <div className="text-4xl mb-4">{f.icon}</div>
                                <h3 className="font-cyber text-white font-bold text-lg mb-3">{f.title}</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                                <div className="mt-5 pt-4 border-t" style={{ borderColor: 'rgba(6,182,212,0.12)' }}>
                                    <span className="text-sm font-medium" style={{ color: '#06B6D4' }}>Explore module →</span>
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section id="how-it-works" className="py-24 px-6">
                <div className="max-w-7xl mx-auto">
                    <motion.div variants={fadeUp} initial="hidden" whileInView="visible"
                        viewport={{ once: true }} className="text-center mb-16 space-y-4">
                        <span className="text-sm font-semibold tracking-widest uppercase font-cyber" style={{ color: '#06B6D4' }}>Process</span>
                        <h2 className="font-cyber text-4xl font-bold text-white">
                            How <span style={{ color: '#06B6D4' }}>JobShield</span> Works
                        </h2>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8 relative">
                        <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
                        {HOW_IT_WORKS.map((step, i) => (
                            <motion.div key={step.step} variants={fadeUp} initial="hidden" whileInView="visible"
                                viewport={{ once: true }} custom={i} className="text-center space-y-4">
                                <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
                                    <div className="absolute inset-0 rounded-full border-2 animate-ping" style={{ borderColor: 'rgba(6,182,212,0.28)', animationDuration: `${2 + i}s` }} />
                                    <div className="relative w-20 h-20 rounded-full flex items-center justify-center font-cyber font-black text-2xl"
                                        style={{ color: '#06B6D4', background: 'rgba(6,182,212,0.08)', border: '2px solid rgba(6,182,212,0.30)', boxShadow: '0 0 20px rgba(6,182,212,0.15)' }}>
                                        {step.step}
                                    </div>
                                </div>
                                <h3 className="font-cyber text-white font-bold text-lg">{step.title}</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── STATS SECTION ── */}
            <section id="stats" className="py-24 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="glass-card p-12">
                        <motion.div variants={fadeUp} initial="hidden" whileInView="visible"
                            viewport={{ once: true }} className="text-center mb-12">
                            <h2 className="font-cyber text-3xl font-bold text-white mb-3">
                                Trusted by <span style={{ color: '#06B6D4' }}>Job Seekers Worldwide</span>
                            </h2>
                        </motion.div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            {STATS.map((stat, i) => (
                                <motion.div key={stat.label} variants={fadeUp} initial="hidden"
                                    whileInView="visible" viewport={{ once: true }} custom={i}
                                    className="text-center space-y-2">
                                    <div className="font-cyber text-4xl font-black text-glow" style={{ color: '#06B6D4' }}>
                                        <CounterStat end={stat.value} suffix={stat.suffix} />
                                    </div>
                                    <p className="text-gray-400 text-sm">{stat.label}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className="py-12 px-6 border-t" style={{ borderColor: 'rgba(6,182,212,0.12)' }}>
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🛡️</span>
                            <div>
                                <p className="font-cyber text-white font-bold text-lg">JobShield</p>
                                <p className="text-gray-500 text-xs">AI-Powered Cyber Job Security</p>
                            </div>
                        </div>
                        <div className="flex gap-8 text-sm text-gray-500">
                            <a href="#" className="hover:text-cyan-400 transition-colors">Privacy Policy</a>
                            <a href="#" className="hover:text-cyan-400 transition-colors">Terms of Service</a>
                            <a href="#" className="hover:text-cyan-400 transition-colors">Contact</a>
                        </div>
                        <p className="text-gray-600 text-xs">
                            © 2026 JobShield. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
