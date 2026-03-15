import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';
import api from '../api/axios';
import { localResumeAnalyze, localJobAnalyze, localLinkAnalyze } from '../utils/localEngines';
import DeepTracePanel    from './DeepTracePanel';

// ── Security quotes (rotates every session) ───────────────────
const SECURITY_QUOTES = [
    { text: 'Detect. Protect. Analyze.', sub: 'AI-Powered Career Shield' },
    { text: 'Protecting your career from hidden risks.', sub: 'Threat Intelligence Center' },
    { text: 'Smart intelligence for safer opportunities.', sub: 'JobShield AI — Always Watching' },
    { text: 'Your career safety is our priority.', sub: 'Real-Time Fraud Detection' },
    { text: 'Trust no link. Verify every job.', sub: 'Zero-Trust Career Defense' },
    { text: 'Fake jobs end here.', sub: 'Powered by 30+ Fraud Signals' },
];
const SESSION_QUOTE = SECURITY_QUOTES[Math.floor(Date.now() / 1000) % SECURITY_QUOTES.length];

// ── Shared animation variants ─────────────────────────────────
const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
    exit: { opacity: 0, y: -12, transition: { duration: 0.25 } },
};

// getRiskMetadata — centralised AFTER we had 3 separate score→color mappings that drifted out of sync.
// The ScoreRing was showing green for a 60 score while the banner showed red. Nightmare to debug.
// Now everything reads from here and if you change the thresholds, you change them in one place.
// Traffic-Light spec: 0–15 SAFE (green), 16–50 MID RISK (orange), 51–100 HIGH RISK (red)
function getRiskMetadata(score) {
    if (score <= 15) return {
        label: 'SAFE',
        color: '#28a745',
        colorBg: 'rgba(40,167,69,0.12)',
        colorBorder: 'rgba(40,167,69,0.40)',
        icon: '🟢',
    };
    if (score <= 50) return {
        label: 'MID RISK',
        color: '#fd7e14',
        colorBg: 'rgba(253,126,20,0.12)',
        colorBorder: 'rgba(253,126,20,0.45)',
        icon: '🟠',
    };
    return {
        label: 'HIGH RISK',
        color: '#dc3545',
        colorBg: 'rgba(220,53,69,0.12)',
        colorBorder: 'rgba(220,53,69,0.45)',
        icon: '🔴',
    };
}

// ── Score Ring (circular progress) ───────────────────────────────
function ScoreRing({ score, color, size = 110, label }) {
    // Always derive color from getRiskMetadata if not explicitly overridden
    const meta = getRiskMetadata(score);
    const c = color || meta.color;
    const lbl = label || (score >= 70 ? 'STRONG' : score >= 40 ? 'AVERAGE' : 'WEAK');
    const r = 40, cx = 50, cy = 50;
    const circ = 2 * Math.PI * r;
    const dash = (score / 100) * circ;
    return (
        <div className="flex flex-col items-center gap-2">
            <svg viewBox="0 0 100 100" width={size} height={size}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,229,255,0.07)" strokeWidth="10" />
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={c} strokeWidth="10"
                    strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
                    transform="rotate(-90 50 50)"
                    style={{ filter: `drop-shadow(0 0 8px ${c})`, transition: 'stroke-dasharray 1.2s ease' }} />
                <text x="50" y="47" textAnchor="middle" fill={c} fontSize="20" fontFamily="Orbitron" fontWeight="bold">{score}</text>
                <text x="50" y="63" textAnchor="middle" fill="#4FC3F7" fontSize="9" fontFamily="Inter">/100</text>
            </svg>
            <span className="text-xs font-cyber font-bold tracking-widest" style={{ color: c }}>{lbl}</span>
        </div>
    );
}

// ── Risk Verdict Badge ─────────────────────────────────────────────────
function VerdictBadge({ verdict, score, large }) {
    // If a raw score is passed, derive meta from it (most accurate path).
    // Otherwise fall back to looking up the verdict string.
    let meta;
    if (typeof score === 'number') {
        meta = getRiskMetadata(score);
    } else {
        // Map legacy/API riskLevel strings → a synthetic score for lookup
        const stringToScore = {
            'HIGH RISK': 75, 'High Risk': 75, 'SUSPICIOUS': 35, 'Suspicious': 35,
            'MID RISK': 35, 'Mid Risk': 35, 'LOW RISK': 0,
            'Low Risk': 0, 'SAFE': 0, 'Safe': 0,
        };
        meta = getRiskMetadata(stringToScore[verdict] ?? 0);
    }
    return (
        <span className={`inline-flex items-center gap-2 px-4 ${large ? 'py-3 text-base' : 'py-2 text-sm'} rounded-full font-cyber font-bold tracking-widest`}
            style={{ background: meta.colorBg, border: `1px solid ${meta.colorBorder}`, color: meta.color }}>
            {meta.icon} {meta.label}
        </span>
    );
}

// ── Panel Card Wrapper ────────────────────────────────────────
function PanelCard({ icon, title, subtitle, children }) {
    return (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" exit="exit"
            className="glass-card p-6 space-y-5">
            <div className="flex items-center gap-3 border-b pb-4" style={{ borderColor: 'rgba(0,229,255,0.10)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.18)' }}>
                    {icon}
                </div>
                <div>
                    <h3 className="font-cyber text-white font-bold text-sm tracking-wide">{title}</h3>
                    <p style={{ color: '#B0BEC5' }} className="text-xs">{subtitle}</p>
                </div>
            </div>
            {children}
        </motion.div>
    );
}

// ── Flag List ─────────────────────────────────────────────────
function FlagList({ flags, color = '#EF4444', icon = '⚠', title }) {
    if (!Array.isArray(flags) || flags.length === 0) return null;
    return (
        <div className="space-y-2">
            <p className="text-xs font-cyber font-bold tracking-widest mb-2" style={{ color }}>{title} ({flags.length})</p>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {flags.map((f, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="px-3 py-1.5 rounded-lg text-xs flex items-start gap-2"
                        style={{ background: color + '08', border: `1px solid ${color}18` }}>
                        <span style={{ color }} className="flex-shrink-0">{icon}</span>
                        <span className="text-gray-300">{f}</span>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ value, label, color }) {
    return (
        <div className="glass-card px-4 py-3 text-center min-w-[100px]">
            <p className="font-cyber text-2xl font-black" style={{ color }}>{value}</p>
            <p className="text-gray-500 text-xs mt-1">{label}</p>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// PANEL A — RESUME ANALYZER
// ══════════════════════════════════════════════════════════════

/** Circular SVG score ring for the dual-panel resume result */
function AtsRing({ score }) {
    const s = Math.max(0, Math.min(100, Math.round(score || 0)));
    const r = 42, circ = 2 * Math.PI * r;
    const fill = circ * (1 - s / 100);
    const color = s >= 70 ? '#22c55e' : s >= 45 ? '#f59e0b' : '#ef4444';
    const label = s >= 70 ? 'Strong' : s >= 45 ? 'Average' : 'Weak';
    return (
        <div className="flex flex-col items-center gap-2">
            <svg width="106" height="106" viewBox="0 0 106 106">
                <circle cx="53" cy="53" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                <circle cx="53" cy="53" r={r} fill="none" stroke={color} strokeWidth="10"
                    strokeDasharray={circ} strokeDashoffset={fill}
                    strokeLinecap="round" transform="rotate(-90 53 53)"
                    style={{ transition: 'stroke-dashoffset 1s ease' }} />
                <text x="53" y="49" textAnchor="middle" fill={color} fontSize="20" fontWeight="800" fontFamily="monospace">{s}</text>
                <text x="53" y="63" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="monospace">/ 100</text>
            </svg>
            <span className="text-xs font-cyber font-bold tracking-widest" style={{ color }}>{label.toUpperCase()}</span>
        </div>
    );
}

/** Checklist item for Hiring Criteria */
function CriteriaRow({ label, met }) {
    return (
        <div className="flex items-center gap-2 text-xs py-1">
            <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold
                ${met ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                {met ? '✓' : '✗'}
            </span>
            <span className={met ? 'text-gray-300' : 'text-gray-500'}>{label}</span>
        </div>
    );
}

function ResumeAnalyzerPanel() {
    const [tab, setTab] = useState('upload'); // 'upload' | 'paste'
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [uploadError, setUploadError] = useState('');
    const fileRef = useRef(null);

    const [resumeText, setResumeText] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [textResult, setTextResult] = useState(null);
    const [textError, setTextError] = useState('');

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile) { setUploadError('Please select a file.'); return; }
        setUploadError(''); setUploadResult(null); setUploading(true);
        try {
            const formData = new FormData();
            formData.append('resume', uploadFile);
            const { data } = await api.post('/resume/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadResult(data);
            setUploadFile(null);
            if (fileRef.current) fileRef.current.value = '';
        } catch (err) {
            setUploadError(err.response?.data?.message || 'Upload failed. Please try again.');
        } finally { setUploading(false); }
    };

    const handleTextAnalyze = async (e) => {
        e.preventDefault();
        if (!resumeText.trim() || resumeText.length < 20) { setTextError('Paste at least 20 characters of your resume.'); return; }
        setTextError(''); setTextResult(null); setAnalyzing(true);
        try {
            const { data } = await api.post('/analyze/resume-text', { resumeText: resumeText.trim() });
            setTextResult(data);
        } catch (err) {
            // ── Local fallback: runs instantly in browser, no backend needed ──
            console.warn('[Resume] API unreachable — using local engine:', err.message);
            setTextResult(localResumeAnalyze(resumeText.trim()));
        } finally { setAnalyzing(false); }
    };

    return (
        <div className="space-y-6">
            <PanelCard icon="📄" title="Resume Analyzer" subtitle="Upload or paste your resume for instant career intelligence">
                {/* Tab toggle */}
                <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(6,182,212,0.12)' }}>
                    {[{ id: 'upload', label: '📁 File Upload' }, { id: 'paste', label: '📋 Paste Text' }].map(t => (
                        <button key={t.id} onClick={() => { setTab(t.id); setUploadResult(null); setTextResult(null); }}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${tab === t.id ? 'text-cyan-400' : 'text-gray-400 hover:text-gray-200'}`}
                            style={tab === t.id ? { background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.30)', color: '#06B6D4' } : {}}>
                            {t.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {/* FILE UPLOAD TAB */}
                    {tab === 'upload' && (
                        <motion.div key="upload" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
                            <form onSubmit={handleUpload} className="space-y-4">
                                <motion.div whileHover={{ borderColor: 'rgba(6,182,212,0.5)' }}
                                    onClick={() => fileRef.current?.click()}
                                    className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300" style={{ borderColor: 'rgba(6,182,212,0.25)' }}>
                                    <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                                        onChange={(e) => { setUploadFile(e.target.files[0]); setUploadResult(null); setUploadError(''); }} />
                                    {uploadFile ? (
                                        <div className="space-y-2">
                                            <p className="text-4xl">📄</p>
                                            <p className="text-white font-semibold text-sm">{uploadFile.name}</p>
                                            <p className="text-gray-500 text-xs">{(uploadFile.size / 1024).toFixed(0)} KB</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <p className="text-4xl text-gray-600">☁️</p>
                                            <p className="text-gray-400 text-sm">Click to select your resume</p>
                                            <p className="text-gray-600 text-xs">PDF, DOCX, DOC, TXT · Max 5 MB</p>
                                        </div>
                                    )}
                                </motion.div>
                                {uploadError && <p className="text-sm flex items-center gap-2" style={{ color: '#EF4444' }}>⚠ {uploadError}</p>}
                                <button type="submit" disabled={!uploadFile || uploading}
                                    className="btn-neon w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {uploading ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Analyzing...</> : '📤 Upload & Analyze Resume'}
                                </button>
                            </form>
                            {/* Upload Result — split-screen */}
                            <AnimatePresence>
                                {uploadResult?.analysis && (
                                    <motion.div variants={fadeUp} initial="hidden" animate="visible" exit="exit"
                                        className="mt-5 pt-5 border-t" style={{ borderColor: 'rgba(6,182,212,0.12)' }}>
                                        <p className="text-xs font-cyber font-bold tracking-widest mb-4" style={{ color: '#06B6D4' }}>📊 ANALYSIS RESULTS</p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <ScoreRing score={uploadResult.analysis.score} />
                                            <div className="space-y-2 text-xs text-gray-400 flex flex-col justify-center">
                                                <div><span className="text-white font-medium">{uploadResult.analysis.wordCount}</span> words detected</div>
                                                {uploadResult.analysis.detectedSkills?.length > 0 && (
                                                    <div><span className="text-white">{uploadResult.analysis.detectedSkills.slice(0, 4).join(', ')}</span>
                                                        {uploadResult.analysis.detectedSkills.length > 4 && <span className="text-gray-500"> +{uploadResult.analysis.detectedSkills.length - 4} more</span>}
                                                    </div>
                                                )}
                                                <span className="px-2 py-1 rounded text-xs font-cyber font-bold w-fit"
                                                    style={{ background: 'rgba(6,182,212,0.1)', color: '#06B6D4' }}>
                                                    {uploadResult.analysis.category}
                                                </span>
                                            </div>
                                        </div>
                                        {uploadResult.analysis.suggestions?.length > 0 && (
                                            <div className="mt-4 space-y-2">
                                                <p className="text-xs font-cyber font-bold text-yellow-500 tracking-widest">💡 TOP SUGGESTIONS</p>
                                                {uploadResult.analysis.suggestions.slice(0, 3).map((s, i) => (
                                                    <div key={i} className="px-3 py-2 rounded-lg text-xs text-gray-300 flex items-start gap-2"
                                                        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                                                        <span className="text-yellow-500 flex-shrink-0">→</span>{s}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {uploadResult.analysis.strengths?.length > 0 && (
                                            <FlagList flags={uploadResult.analysis.strengths.slice(0, 5)} color="#22c55e" icon="✓" title="✓ STRENGTHS" />
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}

                    {/* TEXT PASTE TAB */}
                    {tab === 'paste' && (
                        <motion.div key="paste" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
                            <form onSubmit={handleTextAnalyze} className="space-y-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Resume Text</label>
                                    <textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)}
                                        placeholder="Paste your resume content here — include skills, education, experience, contact info..."
                                        rows={8} className="cyber-input w-full px-4 py-3 text-sm resize-none" />
                                    <p className="text-xs text-gray-600">{resumeText.length} characters</p>
                                </div>
                                {textError && <p className="text-sm flex items-center gap-2" style={{ color: '#EF4444' }}>⚠ {textError}</p>}
                                <button type="submit" disabled={!resumeText.trim() || analyzing}
                                    className="btn-neon w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                    {analyzing ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Analyzing...</> : '🔎 Analyze Resume Text'}
                                </button>
                            </form>

                            {/* ── DUAL-PANEL RESULT DASHBOARD ── */}
                            <AnimatePresence>
                                {textResult && (
                                    <motion.div variants={fadeUp} initial="hidden" animate="visible" exit="exit"
                                        className="mt-5 pt-5 border-t" style={{ borderColor: 'rgba(6,182,212,0.12)' }}>
                                        <p className="text-xs font-cyber font-bold tracking-widest mb-4" style={{ color: '#06B6D4' }}>📊 CAREER ASSESSMENT REPORT</p>

                                        {/* ── Split Grid ── */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                            {/* ── LEFT: Score Panel ── */}
                                            <div className="glass-card p-5 space-y-4 flex flex-col items-center">
                                                <p className="text-[10px] font-cyber font-bold tracking-widest text-cyan-400 self-start">🎯 ATS MATCH SCORE</p>
                                                <AtsRing score={textResult.atsScore ?? textResult.careerStrengthScore ?? 0} />

                                                {/* Metrics grid */}
                                                <div className="w-full grid grid-cols-2 gap-2 mt-2">
                                                    {[
                                                        { label: 'Word Count',   val: textResult.wordCount ?? '—' },
                                                        { label: 'STAR Bullets', val: textResult.strengths?.filter(s => s.includes('S.T.A.R')).length > 0 ? '✓ Found' : '✗ None' },
                                                        { label: 'Skills Found', val: (textResult.flaggedAnomalies?.filter(a => a.includes('Missing')).length == 0) ? '✓ Good' : `${textResult.flaggedAnomalies?.filter(a => a.includes('Missing')).length ?? 0} missing` },
                                                        { label: 'Logic Grade',  val: textResult.logicCategory ?? textResult.category ?? '—' },
                                                    ].map(m => (
                                                        <div key={m.label} className="rounded-lg p-2.5 text-center"
                                                            style={{ background: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.12)' }}>
                                                            <p className="text-white text-xs font-bold">{String(m.val)}</p>
                                                            <p className="text-gray-600 text-[10px] mt-0.5">{m.label}</p>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Strengths pills */}
                                                {textResult.strengths?.length > 0 && (
                                                    <div className="w-full space-y-1">
                                                        <p className="text-[10px] font-cyber text-green-400 font-bold tracking-widest">✓ STRENGTHS</p>
                                                        {textResult.strengths.slice(0, 3).map((s, i) => (
                                                            <div key={i} className="text-[11px] text-gray-300 flex items-start gap-1.5 py-0.5">
                                                                <span className="text-green-400 flex-shrink-0 mt-px">✓</span>{s}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* ── RIGHT: Suggestions Panel ── */}
                                            <div className="glass-card p-5 space-y-4">
                                                <p className="text-[10px] font-cyber font-bold tracking-widest text-amber-400">🏢 COMPANY CRITERIA & SUGGESTIONS</p>

                                                {/* Sub-section 1: Missing Keywords */}
                                                <div className="space-y-1.5">
                                                    <p className="text-[10px] font-semibold text-red-400 uppercase tracking-widest">① Missing Keywords / Action Verbs</p>
                                                    {textResult.topSuggestions?.length > 0 ? (
                                                        textResult.topSuggestions.map((s, i) => (
                                                            <div key={i} className="px-3 py-2 rounded-lg text-[11px] text-gray-300 flex items-start gap-2"
                                                                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                                                <span className="text-red-400 flex-shrink-0 font-bold">{i + 1}.</span>{s}
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <p className="text-[11px] text-green-400 px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>✓ No critical keyword gaps detected</p>
                                                    )}
                                                </div>

                                                {/* Sub-section 2: Formatting Issues */}
                                                <div className="space-y-1.5">
                                                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest">② Formatting & Impact Issues</p>
                                                    {[
                                                        { issue: 'Quantify impact with numbers/metrics (%, $, users)', flagged: !textResult.strengths?.some(s => s.includes('metric')) },
                                                        { issue: 'Start bullets with strong action verbs (Built, Led, Designed)', flagged: !textResult.strengths?.some(s => s.includes('S.T.A.R')) },
                                                        { issue: 'Resume length: keep 300–750 words for ATS', flagged: textResult.wordCount < 300 || textResult.wordCount > 750 },
                                                        { issue: 'Remove buzzwords (synergy, go-getter, self-starter)', flagged: textResult.flaggedAnomalies?.some(a => a.includes('Buzzword')) },
                                                    ].map((row, i) => (
                                                        <div key={i} className={`px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-2 ${
                                                            row.flagged
                                                                ? 'text-amber-200 border border-amber-500/20' : 'text-green-300 border border-green-500/15'}`}
                                                            style={{ background: row.flagged ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.04)' }}>
                                                            <span className={`flex-shrink-0 font-bold ${row.flagged ? 'text-amber-400' : 'text-green-400'}`}>{row.flagged ? '⚠' : '✓'}</span>
                                                            {row.issue}
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Sub-section 3: Hiring Criteria Checklist */}
                                                <div className="space-y-0.5">
                                                    <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-widest">③ Standard Hiring Criteria Match</p>
                                                    <div className="rounded-xl p-3 space-y-0.5" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.10)' }}>
                                                        {[
                                                            { label: 'Technical skills section present',     met: textResult.strengths?.some(s => s.toLowerCase().includes('skill') || s.toLowerCase().includes('tech')) },
                                                            { label: 'Quantified achievements (numbers/metrics)', met: textResult.strengths?.some(s => s.includes('metric')) },
                                                            { label: 'Action verb-driven bullet points',      met: textResult.strengths?.some(s => s.includes('S.T.A.R')) },
                                                            { label: 'Educational background mentioned',      met: /\b(b\.?tech|b\.?e\.?|m\.?tech|mba|degree|bachelor|master|diploma)\b/i.test(resumeText) },
                                                            { label: 'Contact details present',              met: /\b(email|phone|linkedin|github|\+?\d{10})\b/i.test(resumeText) },
                                                            { label: 'Optimal word count (300–750)',         met: textResult.wordCount >= 300 && textResult.wordCount <= 750 },
                                                        ].map((c, i) => <CriteriaRow key={i} label={c.label} met={Boolean(c.met)} />)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </AnimatePresence>
            </PanelCard >
        </div >
    );
}

// ══════════════════════════════════════════════════════════════
// PANEL B — JOB INTELLIGENCE ANALYZER
// ══════════════════════════════════════════════════════════════
function JobIntelligencePanel() {
    const [jobText,       setJobText]       = useState('');
    const [recruiterEmail, setRecruiterEmail] = useState('');
    const [company,       setCompany]       = useState('');
    const [analyzing,     setAnalyzing]     = useState(false);
    const [jobScanResult, setJobScanResult] = useState(null);
    const [jobScanError,  setJobScanError]  = useState('');

    // Validate email format for the required field
    const emailValid = /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(recruiterEmail.trim());
    const canSubmit  = jobText.trim().length >= 10 && emailValid && !analyzing;

    const handleAnalyze = async (e) => {
        e.preventDefault();
        if (!emailValid) { setJobScanError('Please enter a valid recruiter email address.'); return; }
        if (!jobText.trim() || jobText.length < 10) { setJobScanError('Please enter at least 10 characters of the job posting.'); return; }
        setJobScanError(''); setJobScanResult(null); setAnalyzing(true);
        try {
            const { data: rawJobPayload } = await api.post('/analyze/fake-job', { jobText, recruiterEmail: recruiterEmail.trim(), company });
            const finalScore = rawJobPayload.score ?? rawJobPayload.riskScore ?? 0;
            const riskMeta = getRiskMetadata(finalScore);
            const matchProbability = Math.max(5, Math.min(95, Math.round(100 - finalScore * 0.75)));
            console.log('DEBUG [Dashboard] Job scan result — score:', finalScore, '| level:', riskMeta.label);
            setJobScanResult({ ...rawJobPayload, score: finalScore, meta: riskMeta, matchProbability });
        } catch (jobScanErr) {
            // ── Local fallback: Entity Matrix runs instantly in browser ──
            console.warn('[Job] API unreachable — using local engine:', jobScanErr.message);
            const local = localJobAnalyze(jobText, recruiterEmail.trim(), company);
            const riskMeta = getRiskMetadata(local.score);
            const matchProbability = Math.max(5, Math.min(95, Math.round(100 - local.score * 0.75)));
            setJobScanResult({ ...local, meta: riskMeta, matchProbability });
        } finally { setAnalyzing(false); }
    };

    return (
        <div className="space-y-6">
            <PanelCard icon="🔍" title="Job Intelligence Analyzer" subtitle="Detect fake jobs, fraud patterns & company credibility signals">
                <form onSubmit={handleAnalyze} className="space-y-4">
                    {/* ── Row 1: Recruiter Email (REQUIRED) + Company ── */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5"
                                style={{ color: recruiterEmail && !emailValid ? '#ef4444' : '#9ca3af' }}>
                                ✉ Recruiter Email
                                <span className="text-red-500 font-bold">*</span>
                            </label>
                            <input
                                type="email"
                                value={recruiterEmail}
                                onChange={e => { setRecruiterEmail(e.target.value); setJobScanError(''); }}
                                placeholder="hr@company.com"
                                autoComplete="email"
                                className="cyber-input px-3 py-2.5 text-sm w-full transition-all duration-200"
                                style={{
                                    borderColor: recruiterEmail
                                        ? emailValid ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)'
                                        : undefined,
                                    boxShadow: recruiterEmail
                                        ? emailValid ? '0 0 8px rgba(34,197,94,0.15)' : '0 0 8px rgba(239,68,68,0.15)'
                                        : undefined,
                                }}
                            />
                            {recruiterEmail && !emailValid && (
                                <p className="text-[10px] text-red-400">Enter a valid email (e.g. hr@company.com)</p>
                            )}
                            {recruiterEmail && emailValid && (
                                <p className="text-[10px] text-green-400">✓ Email format valid — domain will be threat-scored</p>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Company</label>
                            <input value={company} onChange={e => setCompany(e.target.value)}
                                placeholder="e.g. TechCorp Pvt Ltd" className="cyber-input px-3 py-2.5 text-sm w-full" />
                        </div>
                    </div>
                    {/* ── Row 2: Job Text ── */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Job Description / Posting</label>
                        <textarea value={jobText} onChange={e => setJobText(e.target.value)}
                            placeholder="Paste the full job description, recruitment email, or job ad here..."
                            rows={7} className="cyber-input w-full px-4 py-3 text-sm resize-none" />
                        <p className="text-xs text-gray-600">{jobText.length} characters · 30+ fraud rules applied</p>
                    </div>
                    {jobScanError && <p className="text-sm flex items-center gap-2" style={{ color: '#EF4444' }}>⚠ {jobScanError}</p>}
                    {/* Button locked until email is valid + job text has content */}
                    <button type="submit" disabled={!canSubmit}
                        className="btn-neon w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!emailValid ? 'Enter a valid recruiter email to unlock analysis' : ''}>
                        {analyzing
                            ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Scanning for fraud...</>
                            : !emailValid
                                ? '🔒 Enter Recruiter Email to Analyze'
                                : '🔍 Analyze Job Posting'}
                    </button>
                </form>
            </PanelCard>

            {/* Analysis Result */}
            <AnimatePresence>
                {jobScanResult && (
                    <motion.div key="job-scan-result" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
                        <div className="glass-card p-6 space-y-6">
                            {/* Header */}
                            <div className="flex flex-wrap items-center gap-4 justify-between">
                                <div>
                                    <p className="text-xs font-cyber font-bold tracking-widest mb-1" style={{ color: '#06B6D4' }}>🛡️ THREAT ASSESSMENT REPORT</p>
                                    <h4 className="text-white font-semibold font-mono text-sm">{jobScanResult.recruiterEmail || recruiterEmail || 'Recruiter Email Not Provided'}</h4>
                                    <p className="text-gray-500 text-xs">{company || jobScanResult.company || 'Unknown Company'}</p>
                                </div>
                                <VerdictBadge score={jobScanResult.score} large />
                            </div>

                            {/* Score Grid */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="glass-card p-4 text-center space-y-2">
                                    {/* ScoreRing: no color override — lets getRiskMetadata() inside ScoreRing decide */}
                                    <ScoreRing
                                        score={jobScanResult.score}
                                        size={100}
                                        label={jobScanResult.meta?.label}
                                    />
                                    <p className="text-xs text-gray-500">Job Risk Score</p>
                                </div>
                                <div className="glass-card p-4 text-center space-y-2">
                                    <ScoreRing
                                        score={jobScanResult.matchProbability}
                                        size={100}
                                        color={jobScanResult.matchProbability >= 70 ? '#22c55e' : jobScanResult.matchProbability >= 40 ? '#f59e0b' : '#EF4444'}
                                        label={jobScanResult.matchProbability >= 70 ? 'HIGH MATCH' : jobScanResult.matchProbability >= 40 ? 'MODERATE' : 'LOW MATCH'}
                                    />
                                    <p className="text-xs text-gray-500">Match Probability</p>
                                </div>
                                <div className="glass-card p-4 text-center space-y-2">
                                    <ScoreRing
                                        score={jobScanResult.confidence}
                                        size={100}
                                        color="#8b5cf6"
                                        label="CONFIDENCE"
                                    />
                                    <p className="text-xs text-gray-500">Analysis Confidence</p>
                                </div>
                            </div>

                            {/* Explanation banner — fully driven by getRiskMetadata result */}
                            <div className="p-4 rounded-xl"
                                style={{ borderLeft: `4px solid ${jobScanResult.meta?.color}`, background: (jobScanResult.meta?.color || '#28a745') + '1a' }}>
                                <p className="text-sm font-semibold" style={{ color: jobScanResult.meta?.color }}>
                                    Risk Score: {jobScanResult.score}/100 — {jobScanResult.meta?.label}
                                </p>
                                {jobScanResult.detectedFlags?.length === 0 && jobScanResult.trustSignals?.length > 0 && (
                                    <p className="text-sm text-gray-300 mt-1">No scam signals detected. Multiple trust indicators confirmed.</p>
                                )}
                                {jobScanResult.riskScore < 10 && jobScanResult.detectedFlags?.length === 0 && (
                                    <p className="text-xs text-gray-500 mt-1">Insufficient data for a confident verdict — paste more of the job posting for better accuracy.</p>
                                )}
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                                <FlagList flags={jobScanResult.detectedFlags} color="#EF4444" icon="🚩" title="🚩 SCAM FLAGS DETECTED" />
                                <FlagList flags={jobScanResult.trustSignals} color="#22c55e" icon="✓" title="✓ TRUST SIGNALS" />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// PANEL C — LINK SECURITY VERIFICATION
// ══════════════════════════════════════════════════════════════
function LinkSecurityPanel() {
    const [url, setUrl] = useState('');
    const [scanning, setScanning] = useState(false);
    const [linkScanResult, setLinkScanResult] = useState(null);
    const [linkScanError, setLinkScanError] = useState('');

    const handleScan = async (e) => {
        e.preventDefault();
        if (!url.trim()) { setLinkScanError('Please enter a URL to scan.'); return; }
        setLinkScanError(''); setLinkScanResult(null); setScanning(true);
        try {
            const { data: rawLinkPayload } = await api.post('/analyze/link', { url: url.trim() });
            console.log('DEBUG [Dashboard] Link scan complete — score:', rawLinkPayload.riskScore, '| level:', rawLinkPayload.riskLevel);
            setLinkScanResult(rawLinkPayload);
        } catch (linkScanErr) {
            // ── Local fallback: 7-signal pattern scanner runs instantly in browser ──
            console.warn('[Link] API unreachable — using local engine:', linkScanErr.message);
            setLinkScanResult(localLinkAnalyze(url.trim()));
        } finally { setScanning(false); }
    };

    const verdictColor = linkScanResult?.riskLevel === 'HIGH RISK' ? '#EF4444' : linkScanResult?.riskLevel === 'SUSPICIOUS' ? '#f59e0b' : '#22c55e';

    return (
        <div className="space-y-6">
            <PanelCard icon="🔗" title="Link Security Verification" subtitle="Scan any URL for phishing, malware, and scam patterns">
                <form onSubmit={handleScan} className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Website / Link URL</label>
                        <div className="flex gap-2">
                            <input value={url} onChange={e => setUrl(e.target.value)}
                                placeholder="https://example.com/jobs/apply"
                                className="cyber-input px-4 py-3 text-sm flex-1" />
                            <button type="submit" disabled={!url.trim() || scanning}
                                className="btn-neon px-6 py-3 flex items-center gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                                {scanning ? <span className="spinner" style={{ width: 18, height: 18 }} /> : '🔎 Scan'}
                            </button>
                        </div>
                    </div>
                    {linkScanError && <p className="text-sm flex items-center gap-2" style={{ color: '#EF4444' }}>⚠ {linkScanError}</p>}
                    <div className="grid grid-cols-3 gap-3 text-center">
                        {[
                            { icon: '🔒', label: 'SSL Check' },
                            { icon: '🕷', label: 'Phishing Detect' },
                            { icon: '📡', label: 'Domain Trust' },
                        ].map(item => (
                            <div key={item.label} className="px-3 py-2 rounded-lg text-xs text-gray-500 flex items-center gap-2 justify-center"
                                style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.12)' }}>
                                <span>{item.icon}</span>{item.label}
                            </div>
                        ))}
                    </div>
                </form>
            </PanelCard>

            {/* Scan Result */}
            <AnimatePresence>
                {linkScanResult && (
                    <motion.div key="link-scan-result" variants={fadeUp} initial="hidden" animate="visible" exit="exit">
                        <div className="glass-card p-6 space-y-6">
                            {/* Header */}
                            <div className="flex flex-wrap items-center gap-4 justify-between">
                                <div>
                                    <p className="text-xs font-cyber font-bold tracking-widest mb-1" style={{ color: '#06B6D4' }}>🔗 LINK SECURITY REPORT</p>
                                    <p className="text-white font-mono text-sm truncate max-w-xs">{linkScanResult.url}</p>
                                    <p className="text-gray-600 text-xs">Scanned {new Date(linkScanResult.scannedAt).toLocaleString()}</p>
                                </div>
                                <VerdictBadge score={linkScanResult.riskScore} large />
                            </div>

                            {/* Score + Verdict */}
                            <div className="flex items-center gap-8">
                                <ScoreRing
                                    score={linkScanResult.riskScore}
                                    size={130}
                                    color={verdictColor}
                                    label={getRiskMetadata(linkScanResult.riskScore).label}
                                />
                                <div className="flex-1 space-y-3">
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Risk Verdict</p>
                                        <VerdictBadge score={linkScanResult.riskScore} />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Risk Score</p>
                                        <p className="text-2xl font-cyber font-black" style={{ color: verdictColor }}>{linkScanResult.riskScore}<span className="text-sm text-gray-500">/100</span></p>
                                    </div>
                                    {linkScanResult.healthScore != null && (
                                        <div className="space-y-1">
                                            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Health Score</p>
                                            <p className="text-lg font-cyber font-bold text-green-400">{linkScanResult.healthScore}<span className="text-xs text-gray-500">/100</span></p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ── MID-RISK GREY AREA CALLOUT ──────────────────────────────── */}
                            {/* Displayed when any of the 5 MID-RISK rules triggered */}
                            {linkScanResult.isMidRiskGreyArea && linkScanResult.midRiskRules?.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="rounded-xl p-4 space-y-3"
                                    style={{
                                        background: 'rgba(253,126,20,0.08)',
                                        border: '1px solid rgba(253,126,20,0.35)',
                                        boxShadow: '0 0 16px rgba(253,126,20,0.12)',
                                    }}>
                                    {/* Badge */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-cyber font-bold tracking-widest"
                                            style={{ background: 'rgba(253,126,20,0.18)', border: '1px solid rgba(253,126,20,0.50)', color: '#fd7e14' }}>
                                            🟠 MID-RISK — SUSPICIOUS / NEEDS VERIFICATION
                                        </span>
                                    </div>

                                    {/* Primary triggered rule */}
                                    <div>
                                        <p className="text-xs font-semibold tracking-widest uppercase mb-1.5" style={{ color: '#fd7e14' }}>
                                            Triggered Classification Rule
                                        </p>
                                        <p className="text-sm font-bold text-white">{linkScanResult.midRiskRule}</p>
                                    </div>

                                    {/* All triggered rules list */}
                                    <div className="space-y-1.5">
                                        {linkScanResult.midRiskRules.map((r, i) => (
                                            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
                                                style={{ background: 'rgba(253,126,20,0.05)', border: '1px solid rgba(253,126,20,0.15)' }}>
                                                <span style={{ color: '#fd7e14' }} className="flex-shrink-0 font-bold">Rule {r.rule}</span>
                                                <span className="text-gray-300">{r.category}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* User guidance */}
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        ⚠ This link falls into a <strong className="text-orange-400">grey area</strong> — the platform or domain is not immediately malicious,
                                        but requires verification before proceeding. Do not submit personal information until you have independently confirmed the legitimacy
                                        of the organisation and the job posting.
                                    </p>
                                </motion.div>
                            )}

                            {/* Explanation */}
                            {linkScanResult.explanation?.length > 0 && (
                                <div className="p-4 rounded-xl text-sm space-y-1" style={{ borderLeft: `4px solid ${verdictColor}`, background: verdictColor + '0d' }}>
                                    {linkScanResult.explanation.map((line, i) => <p key={i} className="text-gray-300">{line}</p>)}
                                </div>
                            )}

                            <div className="grid md:grid-cols-2 gap-4">
                                <FlagList flags={linkScanResult.detectedSignals?.filter(s => !s.includes('[MID-RISK'))} color="#EF4444" icon="⚠" title="⚠ RISK SIGNALS" />
                                <FlagList flags={linkScanResult.trustSignals} color="#22c55e" icon="✓" title="✓ TRUST SIGNALS" />
                            </div>

                            {/* Mid-risk signal detail list */}
                            {linkScanResult.midRiskRules?.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-cyber font-bold tracking-widest" style={{ color: '#fd7e14' }}>
                                        🟠 MID-RISK GREY AREA SIGNALS ({linkScanResult.midRiskRules.length})
                                    </p>
                                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                        {linkScanResult.midRiskRules.map((r, i) => (
                                            <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                className="px-3 py-2 rounded-lg text-xs flex items-start gap-2"
                                                style={{ background: 'rgba(253,126,20,0.05)', border: '1px solid rgba(253,126,20,0.15)' }}>
                                                <span style={{ color: '#fd7e14' }} className="flex-shrink-0 font-bold">Rule {r.rule}</span>
                                                <span className="text-gray-300">{r.label}</span>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {linkScanResult.detectedSignals?.filter(s => !s.includes('[MID-RISK')).length === 0 &&
                                linkScanResult.trustSignals?.length === 0 &&
                                !linkScanResult.isMidRiskGreyArea && (
                                    <p className="text-xs text-gray-500 text-center">No definitive signals detected. Treat with standard caution.</p>
                                )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// PANEL D — SCAN HISTORY
// ══════════════════════════════════════════════════════════════
function HistoryPanel() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/resume/history')
            .then(({ data }) => setHistory(data.resumes || []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    return (
        <PanelCard icon="🕒" title="Scan History" subtitle="Your recent resume uploads and analyses">
            {loading ? (
                <div className="flex items-center justify-center py-10">
                    <span className="spinner" style={{ width: 28, height: 28 }} />
                </div>
            ) : history.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                    <p className="text-5xl">📂</p>
                    <p className="text-gray-400 text-sm">No resume scans yet</p>
                    <p className="text-gray-600 text-xs">Upload a resume to get started</p>
                </div>
            ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {history.map((r, i) => (
                        <motion.div key={r._id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all duration-200">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                                style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.18)' }}>📄</div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium truncate">{r.originalName}</p>
                                <p className="text-gray-500 text-xs">
                                    {new Date(r.createdAt).toLocaleDateString()} · {(r.size / 1024).toFixed(0)} KB
                                </p>
                            </div>
                            {r.riskScore != null ? (
                                <span className="text-xs font-cyber font-bold px-2 py-1 rounded-full flex-shrink-0"
                                    style={{
                                        color: r.riskScore >= 70 ? '#22c55e' : r.riskScore >= 40 ? '#f59e0b' : '#EF4444',
                                        background: r.riskScore >= 70 ? 'rgba(34,197,94,0.1)' : r.riskScore >= 40 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                                    }}>
                                    {r.riskScore}/100
                                </span>
                            ) : (
                                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full flex-shrink-0">✓</span>
                            )}
                        </motion.div>
                    ))}
                </div>
            )}
        </PanelCard>
    );
}

// ══════════════════════════════════════════════════════════════
// OVERVIEW / WELCOME PANEL
// ══════════════════════════════════════════════════════════════
function OverviewPanel({ onNavigate, history }) {
    const securityTips = [
        { icon: '🔒', tip: 'Never pay upfront fees to employers for training or equipment.' },
        { icon: '🕵️', tip: 'Research company domains — scam sites often have typos or odd TLDs.' },
        { icon: '📧', tip: 'Legitimate companies email from corporate domains, not Gmail/Yahoo.' },
        { icon: '💰', tip: 'Unusually high salaries for simple tasks are almost always scams.' },
        { icon: '🪪', tip: 'Never share Aadhaar, PAN, or bank account before official onboarding.' },
        { icon: '🌐', tip: 'Verify job postings on the official company website before applying.' },
    ];

    const modules = [
        { id: 'resume', icon: '📄', label: 'Resume Analyzer', desc: 'Score your resume & get AI improvement suggestions', color: '#00E5FF' },
        { id: 'job', icon: '🔍', label: 'Job Intelligence', desc: 'Detect fake jobs, scam patterns & fraud signals', color: '#4FC3F7' },
        { id: 'link', icon: '🔗', label: 'Link Security', desc: 'Scan any URL for phishing & malware risk', color: '#00C853' },
    ];

    return (
        <div className="space-y-6">
            {/* Quick Action Cards */}
            <div className="grid md:grid-cols-3 gap-4">
                {modules.map((m) => (
                    <motion.button key={m.id} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                        onClick={() => onNavigate(m.id)}
                        className="glass-card p-5 text-left w-full group transition-all duration-300 hover:border-opacity-40"
                        style={{ '--hover-color': m.color }}>
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 transition-all duration-200 group-hover:scale-110"
                            style={{ background: m.color + '18', border: `1px solid ${m.color}30` }}>
                            {m.icon}
                        </div>
                        <p className="font-cyber font-bold text-white text-sm mb-1">{m.label}</p>
                        <p className="text-gray-500 text-xs leading-relaxed">{m.desc}</p>
                        <p className="text-xs font-semibold mt-3 transition-colors duration-200 group-hover:opacity-100 opacity-60"
                            style={{ color: m.color }}>Open Panel →</p>
                    </motion.button>
                ))}
            </div>

            {/* Stats Row */}
            <div className="glass-card p-5">
                <p className="text-xs font-cyber font-bold tracking-widest mb-4" style={{ color: '#00E5FF' }}>📊 SYSTEM ANALYTICS</p>
                <div className="grid grid-cols-4 gap-4 text-center">
                    {[
                        { value: history.length, label: 'Resumes Scanned', color: '#00E5FF' },
                        { value: '30+', label: 'Fraud Rules Active', color: '#4FC3F7' },
                        { value: '24/7', label: 'Shield Status', color: '#00C853' },
                        { value: '100%', label: 'Privacy Safe', color: '#8b5cf6' },
                    ].map(s => (
                        <div key={s.label} className="space-y-1">
                            <p className="font-cyber text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                            <p className="text-gray-500 text-xs">{s.label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Security Tips */}
            <div className="glass-card p-5 space-y-4">
                <p className="text-xs font-cyber font-bold tracking-widest" style={{ color: '#4FC3F7' }}>💡 SECURITY INTELLIGENCE FEED</p>
                <div className="grid md:grid-cols-2 gap-3">
                    {securityTips.map((tip, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.07 }}
                            className="flex items-start gap-3 p-3 rounded-xl transition-all duration-200"
                            style={{ border: '1px solid rgba(0,229,255,0.08)', background: 'rgba(0,229,255,0.02)' }}>
                            <span className="text-xl flex-shrink-0">{tip.icon}</span>
                            <p style={{ color: '#B0BEC5' }} className="text-xs leading-relaxed">{tip.tip}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // must match AuthContext

export default function Dashboard() {
    const { user, logout } = useAuth();
    const [activeSection, setActiveSection] = useState('overview');
    const [profileOpen, setProfileOpen] = useState(false);
    const [history, setHistory] = useState([]);
    const [timeLeft, setTimeLeft] = useState(SESSION_TIMEOUT_MS);
    const lastActivityRef = useRef(Date.now());

    // Countdown timer — resets on activity events
    useEffect(() => {
        const ACTIVITY = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];
        const onActivity = () => { lastActivityRef.current = Date.now(); };
        ACTIVITY.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

        const tick = setInterval(() => {
            const elapsed = Date.now() - lastActivityRef.current;
            setTimeLeft(Math.max(0, SESSION_TIMEOUT_MS - elapsed));
        }, 10_000); // update every 10 s

        return () => {
            ACTIVITY.forEach(e => window.removeEventListener(e, onActivity));
            clearInterval(tick);
        };
    }, []);

    const minutesLeft = Math.floor(timeLeft / 60_000);
    const sessionWarning = minutesLeft < 5;

    useEffect(() => {
        api.get('/resume/history')
            .then(({ data }) => setHistory(data.resumes || []))
            .catch(() => { });
    }, []);

    const sectionTitles = {
        overview: { title: 'Overview', sub: 'Threat Intelligence Center' },
        resume: { title: 'Resume Analyzer', sub: 'Career Protection & Scoring' },
        job: { title: 'Job Intelligence', sub: 'Fraud Detection Engine' },
        link:     { title: 'Deep Trace Engine', sub: 'Live Redirect Chain Crawler' },
        history:  { title: 'Scan History',       sub: 'Recent Activity Log' },
    };

    const current = sectionTitles[activeSection] || sectionTitles.overview;

    return (
        <div className="min-h-screen flex relative z-10">
            <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} />

            <main className="flex-1 ml-64 min-h-screen overflow-y-auto">
                {/* Top Bar */}
                <div className="sticky top-0 z-30 px-8 py-4 flex items-center justify-between"
                    style={{ background: 'rgba(2,10,24,0.96)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
                    <div>
                        {/* Security Quote — changes each session */}
                        <p className="font-cyber text-white font-bold text-sm tracking-wide"
                            style={{ textShadow: '0 0 18px rgba(0,229,255,0.40)' }}>
                            🛡 {SESSION_QUOTE.text}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: '#B0BEC5' }}>{current.title} — {SESSION_QUOTE.sub}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Session Status / Countdown */}
                        <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all duration-500 ${sessionWarning
                            ? 'border-yellow-700/50 text-yellow-400'
                            : 'border-green-900/30 text-green-400'
                            }`} style={{
                                background: sessionWarning ? 'rgba(234,179,8,0.06)' : 'rgba(34,197,94,0.05)',
                            }}>
                            <span className={`w-2 h-2 rounded-full animate-pulse ${sessionWarning ? 'bg-yellow-400' : 'bg-green-500'}`} />
                            <span>{sessionWarning ? `Session expiring in ${minutesLeft}m` : 'Session Active'}</span>
                        </div>
                        {/* Profile Dropdown */}
                        <div className="relative">
                            <button onClick={() => setProfileOpen(!profileOpen)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-300 hover:bg-white/5 transition-all duration-200">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                                    style={{ background: 'linear-gradient(135deg, #0077b6, #005f8a)', boxShadow: '0 0 10px rgba(0,229,255,0.25)' }}>
                                    {user?.username?.[0]?.toUpperCase()}
                                </div>
                                <span className="hidden md:block font-medium">{user?.username}</span>
                                <span className="text-gray-500">▾</span>
                            </button>
                            <AnimatePresence>
                                {profileOpen && (
                                    <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                        className="absolute right-0 top-full mt-2 w-52 glass-card p-2 z-50">
                                        <div className="px-3 py-2 border-b mb-1" style={{ borderColor: 'rgba(0,229,255,0.12)' }}>
                                            <p className="text-white text-sm font-semibold">{user?.username}</p>
                                            <p className="text-xs truncate" style={{ color: '#B0BEC5' }}>{user?.email}</p>
                                        </div>
                                        <button onClick={() => { setProfileOpen(false); logout(); }}
                                            className="w-full text-left px-3 py-2 text-sm hover:text-white rounded-lg transition-all"
                                            style={{ color: '#4FC3F7' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,255,0.08)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            ← Sign Out
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Welcome Banner */}
                {activeSection === 'overview' && (
                    <div className="px-8 pt-6">
                        <motion.div variants={fadeUp} initial="hidden" animate="visible"
                            className="glass-card p-5 relative overflow-hidden mb-6">
                            <div className="absolute inset-0 pointer-events-none"
                                style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(0,229,255,0.05) 0%, transparent 60%)' }} />
                            <div className="relative flex items-center justify-between gap-4 flex-wrap">
                                <div className="space-y-1">
                                    <p className="text-xs font-cyber font-bold tracking-widest" style={{ color: '#00E5FF' }}>WELCOME BACK</p>
                                    <h2 className="font-cyber text-2xl font-black text-white">
                                        Hello, <span style={{ color: '#00E5FF' }}>{user?.username}</span> ⚡
                                    </h2>
                                    <p className="text-sm" style={{ color: '#B0BEC5' }}>Your cyber shield is active. Analyze resumes, scan job postings, verify links.</p>
                                </div>
                                <div className="flex gap-3">
                                    <StatCard value={history.length} label="Scans Done" color="#00E5FF" />
                                    <StatCard value="Active" label="Shield Status" color="#00C853" />
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Panel Content */}
                <div className="px-8 pb-8">
                    <AnimatePresence mode="wait">
                        <motion.div key={activeSection} variants={fadeUp} initial="hidden" animate="visible" exit="exit">
                            {activeSection === 'overview' && <OverviewPanel onNavigate={setActiveSection} history={history} />}
                            {activeSection === 'resume' && <ResumeAnalyzerPanel />}
                            {activeSection === 'job'      && <JobIntelligencePanel />}
                            {activeSection === 'link'     && <DeepTracePanel />}
                            {activeSection === 'history'  && <HistoryPanel />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
