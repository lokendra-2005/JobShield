import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function RiskMeter({ score = 0, size = 160 }) {
    const canvasRef = useRef(null);

    const color =
        score >= 66 ? '#ef4444' :
            score >= 36 ? '#f59e0b' :
                '#22c55e';

    const label =
        score >= 66 ? 'HIGH RISK' :
            score >= 36 ? 'MEDIUM RISK' :
                'LOW RISK';

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2 - 14;

        ctx.clearRect(0, 0, size, size);

        // Track
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Fill
        const startAngle = Math.PI * 0.75;
        const endAngle = startAngle + (score / 100) * (Math.PI * 1.5);
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.stroke();
    }, [score, size, color]);

    return (
        <motion.div
            className="flex flex-col items-center gap-2"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        >
            <div className="relative" style={{ width: size, height: size }}>
                <canvas ref={canvasRef} width={size} height={size} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-cyber text-3xl font-bold" style={{ color }}>
                        {score}
                    </span>
                    <span className="text-xs text-gray-500 font-semibold">/100</span>
                </div>
            </div>
            <span className="font-cyber text-xs font-bold tracking-widest" style={{ color }}>
                {label}
            </span>
        </motion.div>
    );
}
