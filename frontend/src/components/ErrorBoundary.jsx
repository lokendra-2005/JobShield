/**
 * ErrorBoundary.jsx (PRODUCTION-READY)
 *
 * Global React error boundary — catches render-time exceptions
 * from any child component and shows a safe fallback UI.
 * Never returns null — always renders something.
 *
 * Usage (in main.jsx):
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 *
 * Catches: render errors, lifecycle errors, constructor errors
 * Does NOT catch: event handlers (use try-catch), async code (use .catch())
 */

import { Component } from 'react';

export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            message: '',
            stack: '',
            errorCount: 0,
        };
    }

    // Called when a descendant throws during rendering
    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            message: error?.message || 'Unknown error occurred',
            stack: error?.stack || '',
        };
    }

    // Log the full error + component stack for debugging
    componentDidCatch(error, info) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            message: error?.message,
            stack: error?.stack,
            componentStack: info?.componentStack,
            userAgent: navigator.userAgent,
            url: window.location.href,
        };

        console.error('[ErrorBoundary] ❌ RENDER ERROR:', error);
        console.error('[ErrorBoundary] Component Stack:', info?.componentStack);
        console.error('[ErrorBoundary] Full Context:', errorLog);

        // Optional: Send to error tracking service (Sentry, LogRocket, etc.)
        // sendToErrorTracking(errorLog);

        this.setState((prev) => ({
            errorCount: prev.errorCount + 1,
        }));
    }

    handleReset = () => {
        console.log('[ErrorBoundary] User clicked "Try again" — resetting state');
        this.setState({ hasError: false, message: '', stack: '', errorCount: 0 });
    };

    handleReload = () => {
        console.log('[ErrorBoundary] User clicked "Reload page"');
        window.location.reload();
    };

    render() {
        // Safe: always render something, never null
        if (!this.state.hasError) {
            return this.props.children || <div />;
        }

        // ── Fallback UI (Development & Production) ────────────
        const isDevelopment = process.env.NODE_ENV === 'development';

        return (
            <div
                role="alert"
                aria-live="assertive"
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 100%)',
                    color: '#f9fafb',
                    fontFamily: 'Inter, sans-serif',
                    padding: '2rem',
                    textAlign: 'center',
                    gap: '1.5rem',
                    zIndex: 9999,
                }}
            >
                {/* Large Warning Icon */}
                <div style={{ fontSize: '4rem', animation: 'pulse 2s infinite' }}>
                    ⚠️
                </div>

                {/* Heading */}
                <div>
                    <h1
                        style={{
                            fontFamily: 'Orbitron, monospace',
                            fontSize: '2rem',
                            fontWeight: 800,
                            color: '#ef4444',
                            letterSpacing: '0.08em',
                            margin: '0 0 0.5rem 0',
                            textTransform: 'uppercase',
                        }}
                    >
                        System Error
                    </h1>
                    <div
                        style={{
                            height: '2px',
                            background: 'linear-gradient(90deg, transparent, #ef4444, transparent)',
                            maxWidth: '200px',
                            margin: '1rem auto',
                        }}
                    />
                </div>

                {/* User-Friendly Message */}
                <p style={{ color: '#d1d5db', maxWidth: '500px', fontSize: '1rem', lineHeight: 1.6 }}>
                    The application encountered an unexpected issue. Don't worry — your data is safe.
                </p>

                {/* Error Count Warning */}
                {this.state.errorCount > 2 && (
                    <p style={{ color: '#fca5a5', fontSize: '0.875rem', fontWeight: 500 }}>
                        ⚡ Multiple errors detected. Please reload the page.
                    </p>
                )}

                {/* Technical Details Section */}
                {isDevelopment && (
                    <details
                        style={{
                            background: 'rgba(239,68,68,0.08)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: '0.75rem',
                            padding: '1rem',
                            maxWidth: '640px',
                            width: '100%',
                            textAlign: 'left',
                            cursor: 'pointer',
                        }}
                    >
                        <summary
                            style={{
                                color: '#9ca3af',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                userSelect: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            📋 Technical Details (Dev Mode)
                        </summary>
                        <div style={{ marginTop: '0.75rem', overflow: 'auto', maxHeight: '300px' }}>
                            <div
                                style={{
                                    color: '#fca5a5',
                                    fontSize: '0.75rem',
                                    fontFamily: 'Monaco, monospace',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    background: 'rgba(0,0,0,0.3)',
                                    padding: '0.75rem',
                                    borderRadius: '0.5rem',
                                }}
                            >
                                <strong>Error Message:</strong>
                                {'\n'}
                                {this.state.message}
                                {'\n\n'}
                                <strong>Stack Trace:</strong>
                                {'\n'}
                                {this.state.stack?.slice(0, 800) || 'No stack trace available'}
                                {this.state.stack?.length > 800 && '\n... (truncated)'}
                            </div>
                        </div>
                    </details>
                )}

                {/* Recovery Buttons */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                        onClick={this.handleReset}
                        style={{
                            background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.625rem',
                            padding: '0.75rem 2rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'all 200ms ease',
                            boxShadow: '0 4px 6px rgba(220,38,38,0.2)',
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.transform = 'translateY(-2px)';
                            e.target.style.boxShadow = '0 6px 12px rgba(220,38,38,0.3)';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = '0 4px 6px rgba(220,38,38,0.2)';
                        }}
                    >
                        🔄 Try Again
                    </button>
                    <button
                        onClick={this.handleReload}
                        style={{
                            background: 'transparent',
                            color: '#60a5fa',
                            border: '1.5px solid rgba(96,165,250,0.4)',
                            borderRadius: '0.625rem',
                            padding: '0.75rem 2rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'all 200ms ease',
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.borderColor = 'rgba(96,165,250,0.7)';
                            e.target.style.color = '#93c5fd';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.borderColor = 'rgba(96,165,250,0.4)';
                            e.target.style.color = '#60a5fa';
                        }}
                    >
                        🔃 Reload Page
                    </button>
                </div>

                {/* Inline Styles for Animations */}
                <style>{`
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.6; }
                    }
                `}</style>
            </div>
        );
    }
}
