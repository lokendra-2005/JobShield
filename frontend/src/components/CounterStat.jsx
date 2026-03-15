import { useEffect, useState, useRef } from 'react';

export default function CounterStat({ end, suffix = '', prefix = '', duration = 2000 }) {
    const [count, setCount] = useState(0);
    const ref = useRef(null);
    const started = useRef(false);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !started.current) {
                started.current = true;
                animateCount();
            }
        }, { threshold: 0.5 });

        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [end]);

    function animateCount() {
        const startTime = performance.now();
        const step = (now) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * end));
            if (progress < 1) requestAnimationFrame(step);
            else setCount(end);
        };
        requestAnimationFrame(step);
    }

    return (
        <span ref={ref} className="stat-number tabular-nums">
            {prefix}{count.toLocaleString()}{suffix}
        </span>
    );
}
