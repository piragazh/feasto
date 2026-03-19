import React from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

const pageVariants = {
    initial: (direction) => ({
        x: direction > 0 ? 300 : -300,
        opacity: 0,
    }),
    animate: {
        x: 0,
        opacity: 1,
        transition: {
            x: { type: 'spring', stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
        },
    },
    exit: (direction) => ({
        x: direction > 0 ? -300 : 300,
        opacity: 0,
        transition: {
            x: { type: 'spring', stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
        },
    }),
};

export function PageTransition({ children }) {
    const location = useLocation();
    
    return (
        <motion.div
            key={location.pathname}
            custom={1}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
        >
            {children}
        </motion.div>
    );
}