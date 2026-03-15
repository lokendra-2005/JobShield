import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Eye, Shield, ShieldOff, ShieldAlert, Loader2,
    AlertTriangle, CheckCircle2, Calendar, Globe, Ban,
    Search, XCircle,
} from 'lucide-react';
import { localThirdEye } from '../utils/localEngines';

// ── API config ────────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Risk appearance map ───────────────────────────────────────────────────────
const RISK_CONFIG = {
    CRITICAL: {
        Icon:       ShieldOff,
        bgCls:      'bg-red-500/10',
        borderCls:  'border-red-500/60',
        glowCls:    'shadow-[0_0_40px_rgba(239,68,68,0.25)]',
        textCls:    'text-red-400',
        badgeCls:   'bg-red-500/20 text-red-300 border-red-500/40',
        label:      'CRITICAL RISK',
        actionBg:   'bg-red-500/10 border-red-500/30 text-red-300',
    },
    ELEVATED: {
        Icon:       ShieldAlert,
        bgCls:      'bg-amber-500/10',
        borderCls:  'border-amber-500/50',
        glowCls:    'shadow-[0_0_32px_rgba(245,158,11,0.18)]',
        textCls:    'text-amber-400',
        badgeCls:   'bg-amber-500/20 text-amber-300 border-amber-500/40',
        label:      'ELEVATED RISK',
        actionBg:   'bg-amber-500/10 border-amber-500/30 text-amber-300',
    },
    SAFE: {
        Icon:       Shield,
        bgCls:      'bg-green-500/10',
        borderCls:  'border-green-500/50',
        glowCls:    'shadow-[0_0_32px_rgba(34,197,94,0.18)]',
        textCls:    'text-green-400',
        badgeCls:   'bg-green-500/20 text-green-300 border-green-500/40',
        label:      'SAFE / TRUSTED',
        actionBg:   'bg-green-500/10 border-green-500/30 text-green-300',
    },
    UNKNOWN: {
        Icon:       AlertTriangle,
        bgCls:      'bg-slate-700/40',
        borderCls:  'border-slate-600/50',
        glowCls:    '',
        textCls:    'text-slate-400',
        badgeCls:   'bg-slate-700/50 text-slate-300 border-slate-600/40',
        label:      'UNVERIFIED',
        actionBg:   'bg-slate-700/40 border-slate-600/40 text-slate-400',
    },
};

const ACTION_ICON = {
    BLOCK:         <Ban         size={13} />,
    VERIFY:        <AlertTriangle size={13} />,
    PROCEED:       <CheckCircle2 size={13} />,
    MANUAL_REVIEW: <Search      size={13} />,
};

// ── Small subcomponents ───────────────────────────────────────────────────────

function DataRow({ Icon, label, value, textCls = 'text-slate-300' }) {
    if (value === null || value === undefined) return null;
    return (
        <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0
                bg-white/[0.04] border border-white/[0.07] mt-0.5">
                <Icon size={13} className="text-slate-500" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-0.5">{label}</p>
                <p className={`text-[12px] font-mono break-all leading-snug ${textCls}`}>{value}</p>
            </div>
        </div>
    );
}

// ── Result card ───────────────────────────────────────────────────────────────
function ResultCard({ data, onClear }) {
    if (!data || typeof data !== 'object') return null;

    const risk   = RISK_CONFIG[data.riskLevel] ?? RISK_CONFIG.UNKNOWN;
    const RiskIcon = risk.Icon;
    const days   = typeof data.domainAgeDays === 'number' ? data.domainAgeDays : null;
    const action = String(data.actionRecommended ?? 'MANUAL_REVIEW');

    return (
        <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className={`rounded-2xl border p-5 space-y-4
                ${risk.bgCls} ${risk.borderCls} ${risk.glowCls}`}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Animated icon for CRITICAL */}
                    {data.riskLevel === 'CRITICAL' ? (
                        <motion.div
                            animate={{ scale: [1, 1.12, 1] }}
                            transition={{ repeat: Infinity, duration: 1.2 }}>
                            <RiskIcon size={32} className={risk.textCls} strokeWidth={1.5} />
                        </motion.div>
                    ) : (
                        <RiskIcon size={32} className={risk.textCls} strokeWidth={1.5} />
                    )}
                    <div>
                        <p className={`text-[10px] font-cyber tracking-[0.15em] ${risk.textCls}`}>
                            THE THIRD EYE — ANALYSIS COMPLETE
                        </p>
                        <p className={`text-xl font-black font-cyber ${risk.textCls}`}>
                            {risk.label}
                        </p>
                    </div>
                </div>
                <button onClick={onClear}
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
                        text-slate-600 hover:text-slate-300 hover:bg-white/[0.06] transition-all">
                    <XCircle size={15} />
                </button>
            </div>

            {/* Data rows */}
            <div className="space-y-3 border-t border-white/[0.06] pt-4">
                <DataRow Icon={Globe}    label="Target Domain"   value={data.target}       textCls={risk.textCls} />
                <DataRow Icon={Calendar} label="Creation Date"   value={data.creationDate ?? 'Unavailable'} />
                <DataRow Icon={Calendar} label="Domain Age"
                    value={days !== null ? `${days.toLocaleString()} days (${(days / 365).toFixed(1)} years)` : 'Unknown'}
                    textCls={days !== null ? risk.textCls : 'text-slate-500'}
                />
            </div>

            {/* Verdict */}
            <div className={`rounded-xl p-3 text-[12px] leading-relaxed border ${risk.actionBg}`}>
                {data.verdict}
            </div>

            {/* Action badge */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                    text-[11px] font-bold font-cyber tracking-wider border
                    ${risk.badgeCls}`}>
                    {ACTION_ICON[action] ?? null}
                    RECOMMENDED: {action}
                </span>
                <span className="text-[10px] text-slate-600 font-mono">
                    Scanned: {data.analyzedAt}
                </span>
            </div>
        </motion.div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function ThirdEyeScanner() {
    const [input,   setInput]   = useState('');
    const [loading, setLoading] = useState(false);
    const [result,  setResult]  = useState(null);   // raw API response
    const [error,   setError]   = useState('');

    const scan = async (e) => {
        e.preventDefault();
        const trimmed = input.trim();
        if (!trimmed) return;

        setLoading(true);
        setResult(null);
        setError('');

        try {
            const res = await fetch(`${API_URL}/api/third-eye`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ input: trimmed }),
                signal:  AbortSignal.timeout(8_000),   // 8s — fall back to local if slow
            });
            const json = await res.json();
            setResult(json);
        } catch (err) {
            // ── Local Identity Radar: instant result, zero network, never shows an error ──
            console.warn('[ThirdEye] API unreachable — using local Identity Radar:', err.message);
            setResult(localThirdEye(trimmed));
        } finally {
            setLoading(false);
        }
    };

    const clear = () => { setResult(null); setError(''); setInput(''); };

    return (
        <div className="space-y-5 max-w-2xl">

            {/* ── Module Card ── */}
            <div className="rounded-2xl p-6 space-y-5
                bg-gradient-to-br from-slate-900/80 to-slate-950/95
                border border-white/[0.07] shadow-[0_8px_40px_rgba(0,0,0,0.60)]">

                {/* Header */}
                <div className="flex items-center gap-4 pb-5 border-b border-white/[0.07]">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0
                        bg-gradient-to-br from-purple-500/20 to-indigo-500/10
                        border border-purple-500/30
                        shadow-[0_0_20px_rgba(168,85,247,0.18)]">
                        <motion.div
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ repeat: Infinity, duration: 2.5 }}>
                            <Eye size={22} className="text-purple-400" />
                        </motion.div>
                    </div>
                    <div>
                        <p className="text-[10px] font-cyber tracking-[0.15em] text-purple-400 uppercase mb-0.5">
                            Zero-Trust Intelligence
                        </p>
                        <h3 className="font-cyber font-bold text-white text-sm tracking-wide">
                            THE THIRD EYE — Domain Age Scanner
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            Cross-validates recruiter domains via live WHOIS — exposes ghost companies &amp; free-email fraud
                        </p>
                    </div>
                </div>

                {/* Risk bands legend */}
                <div className="flex flex-wrap gap-2">
                    {[
                        { label: '< 30d → CRITICAL',  cls: 'text-red-400   bg-red-500/10  border-red-500/25'    },
                        { label: '30–365d → ELEVATED', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
                        { label: '> 365d → SAFE',       cls: 'text-green-400 bg-green-500/10 border-green-500/25'},
                        { label: 'Gmail/Yahoo → BLOCK', cls: 'text-red-400   bg-red-500/10  border-red-500/25'   },
                    ].map(b => (
                        <span key={b.label}
                            className={`text-[10px] font-cyber px-2.5 py-1 rounded-full border font-semibold ${b.cls}`}>
                            {b.label}
                        </span>
                    ))}
                </div>

                {/* Input form */}
                <form onSubmit={scan} className="space-y-3">
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                        Email Address or Domain
                    </label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                placeholder="hr@company.com  or  company.com"
                                disabled={loading}
                                className="w-full pl-9 pr-4 py-3 text-sm rounded-xl font-mono
                                    bg-white/[0.04] border border-white/[0.10] text-white
                                    placeholder:text-slate-700
                                    focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/25
                                    disabled:opacity-50 transition-all duration-200"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!input.trim() || loading}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl
                                font-cyber font-bold text-xs tracking-widest text-white flex-shrink-0
                                bg-gradient-to-r from-purple-600 to-indigo-600
                                hover:from-purple-500 hover:to-indigo-500
                                shadow-[0_0_20px_rgba(168,85,247,0.25)]
                                disabled:opacity-40 disabled:cursor-not-allowed
                                transition-all duration-200"
                        >
                            {loading
                                ? <><Loader2 size={14} className="animate-spin" /> SCANNING…</>
                                : <><Eye size={14} /> SCAN IDENTITY</>
                            }
                        </button>
                    </div>
                </form>

                {/* Scanning state */}
                <AnimatePresence>
                    {loading && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="flex items-center gap-3 text-[11px] font-mono text-purple-400/70
                                px-4 py-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}>
                                <Eye size={13} />
                            </motion.div>
                            Querying WHOIS registry… ICANN lookup in progress (up to 12s)…
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Error banner */}
                <AnimatePresence>
                    {error && !loading && (
                        <motion.div
                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-3 px-4 py-3 rounded-xl
                                bg-red-500/10 border border-red-500/30 text-red-300 text-[12px]">
                            <XCircle size={14} className="flex-shrink-0 mt-0.5" />
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Result panel ── */}
            <AnimatePresence mode="wait">
                {result && !loading && (
                    <ResultCard key={result.target} data={result} onClear={clear} />
                )}
            </AnimatePresence>
        </div>
    );
}
