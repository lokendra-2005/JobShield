import { motion } from 'framer-motion';

// reusable card wrapper with a subtle entrance animation
// hover prop makes it lift slightly - turned off in a few places where it felt too jumpy
export default function Card({ children, className = '', hover = true, delay = 0 }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            whileHover={hover ? { y: -10, scale: 1.02 } : {}}
            className={`glass-card p-6 transition-all duration-300 ${className}`}
        >
            {children}
        </motion.div>
    );
}
