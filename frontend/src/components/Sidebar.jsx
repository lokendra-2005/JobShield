import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

const NAV_MODULES = [
    { id: 'overview', icon: '⚡', label: 'Overview', sublabel: 'Dashboard Home' },
    { id: 'resume', icon: '📄', label: 'Resume Analyzer', sublabel: 'Career Intelligence' },
    { id: 'job', icon: '🔍', label: 'Job Intelligence', sublabel: 'Fraud Detection' },
    { id: 'link',     icon: '🔗', label: 'Link Security',  sublabel: 'Phishing Scanner' },
    { id: 'history',  icon: '🕒', label: 'Scan History',    sublabel: 'Recent Activity' },
];

// These colour tokens started life as CSS variables in index.css but framer-motion
// inline styles don't read CSS vars reliably across all browsers in the versions
// we tested. Moved them here as JS constants instead.
// TODO: revisit if we ever migrate to a design token system
const CYAN = '#00E5FF';
const CYAN_DIM = 'rgba(0,229,255,0.10)';
const CYAN_GLOW = 'rgba(0,229,255,0.25)';
const SIDEBAR_BG = 'rgba(2,10,24,0.98)';
const SIDEBAR_BORDER = 'rgba(0,229,255,0.10)';

export default function Sidebar({ activeSection, setActiveSection }) {
    const { user, logout } = useAuth();

    return (
        <motion.aside
            initial={{ x: -80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, type: 'spring', stiffness: 120 }}
            className="fixed left-0 top-0 h-full w-64 z-40 flex flex-col"
            style={{
                background: SIDEBAR_BG,
                backdropFilter: 'blur(20px)',
                borderRight: `1px solid ${SIDEBAR_BORDER}`,
                boxShadow: `4px 0 48px rgba(0,0,0,0.9), 1px 0 0 ${SIDEBAR_BORDER}`,
            }}
        >
            {/* Logo area */}
            <div className="p-6 border-b" style={{ borderColor: SIDEBAR_BORDER }}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 shield-float"
                        style={{
                            background: `linear-gradient(135deg, #0077b6 0%, #005f8a 100%)`,
                            boxShadow: `0 0 22px ${CYAN_GLOW}`,
                        }}>
                        🛡️
                    </div>
                    <div>
                        <h1 className="font-cyber text-white text-sm font-bold tracking-wider">JobShield AI</h1>
                        <p className="text-xs tracking-widest" style={{ color: CYAN, opacity: 0.6 }}>CAREER PROTECTION</p>
                    </div>
                </div>
            </div>

            {/* Shield active status indicator */}
            <div className="mx-4 mt-4 mb-2 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.18)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full pulse-cyan flex-shrink-0"
                        style={{ background: '#00C853', boxShadow: '0 0 6px #00C853' }} />
                    <span className="text-xs font-medium" style={{ color: '#00C853' }}>Shield System Active</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {NAV_MODULES.map((navEntry) => {
                    const isActive = activeSection === navEntry.id;
                    return (
                        <button
                            key={navEntry.id}
                            onClick={() => setActiveSection(navEntry.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 text-left group relative overflow-hidden"
                            style={isActive ? {
                                background: CYAN_DIM,
                                borderLeft: `3px solid ${CYAN}`,
                                boxShadow: `inset 0 0 25px rgba(0,229,255,0.05)`,
                            } : {}}
                        >
                            <span className="text-lg flex-shrink-0">{navEntry.icon}</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold"
                                    style={{ color: isActive ? CYAN : '#e2e8f0' }}>
                                    {navEntry.label}
                                </p>
                                <p className="text-xs"
                                    style={{ color: isActive ? 'rgba(0,229,255,0.55)' : 'rgba(176,190,197,0.6)' }}>
                                    {navEntry.sublabel}
                                </p>
                            </div>
                            {isActive && (
                                <motion.div layoutId="sidebar-active-indicator"
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: CYAN, boxShadow: `0 0 8px ${CYAN}` }} />
                            )}
                            {!isActive && (
                                <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl"
                                    style={{ background: 'rgba(0,229,255,0.04)' }} />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* User profile + logout */}
            <div className="p-4 border-t" style={{ borderColor: SIDEBAR_BORDER }}>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #0077b6, #005f8a)', boxShadow: `0 0 12px ${CYAN_GLOW}` }}>
                        {user?.username?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{user?.username}</p>
                        <p className="text-xs truncate" style={{ color: '#B0BEC5' }}>{user?.email}</p>
                    </div>
                </div>
                <button onClick={logout}
                    className="w-full py-2 text-xs rounded-lg transition-all duration-200"
                    style={{
                        color: '#4FC3F7',
                        border: `1px solid rgba(79,195,247,0.22)`,
                        background: 'transparent',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(0,229,255,0.08)';
                        e.currentTarget.style.borderColor = `rgba(0,229,255,0.45)`;
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'rgba(79,195,247,0.22)';
                    }}>
                    ← Sign Out
                </button>
            </div>
        </motion.aside>
    );
}
