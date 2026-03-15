import { motion } from 'framer-motion';
import { useState } from 'react';

// main button used everywhere - has a ripple effect on click
// the variant prop switches between solid (default) and outline style
export default function PrimaryButton({
    children,
    onClick,
    type = 'button',
    disabled = false,
    loading = false,
    className = '',
    variant = 'primary',
}) {
    const [ripples, setRipples] = useState([]);

    const handleClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const id = Date.now();
        setRipples((r) => [...r, { x, y, id }]);
        // clean up ripple after animation done
        setTimeout(() => setRipples((r) => r.filter((rr) => rr.id !== id)), 600);
        if (onClick) onClick(e);
    };

    const base =
        variant === 'outline'
            ? 'border border-cyan-500/60 text-cyan-400 bg-transparent hover:bg-cyan-500/10 hover:border-cyan-400'
            : 'btn-neon text-white';

    return (
        <motion.button
            type={type}
            onClick={handleClick}
            disabled={disabled || loading}
            whileTap={{ scale: 0.97 }}
            className={`relative overflow-hidden px-6 py-3 rounded-xl font-semibold text-sm tracking-wide transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${base} ${className}`}
        >
            {ripples.map((r) => (
                <span
                    key={r.id}
                    className="absolute rounded-full bg-white/20 pointer-events-none"
                    style={{
                        left: r.x - 50,
                        top: r.y - 50,
                        width: 100,
                        height: 100,
                        animation: 'ripple 0.6s linear',
                    }}
                />
            ))}
            {loading ? (
                <span className="flex items-center gap-2 justify-center">
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    Processing...
                </span>
            ) : (
                children
            )}
            <style>{`
        @keyframes ripple {
          from { transform: scale(0); opacity: 1; }
          to   { transform: scale(4); opacity: 0; }
        }
      `}</style>
        </motion.button>
    );
}
