import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigationStack } from './NavigationStack';

/**
 * StackNavigationAnimator - Wraps page content with directional slide animations
 * Animates push (slide left) and pop (slide right) based on stack depth changes
 * Properly restores focus after animations complete
 */
export function StackNavigationAnimator({ children }) {
  const location = useLocation();
  const { depth } = useNavigationStack();
  const [prevDepth, setPrevDepth] = useState(depth);
  const [direction, setDirection] = useState('forward');

  // Determine direction based on depth change
  useEffect(() => {
    if (depth > prevDepth) {
      setDirection('forward');
    } else if (depth < prevDepth) {
      setDirection('backward');
    }
    setPrevDepth(depth);
  }, [depth, prevDepth]);

  const variants = {
    initial: {
      opacity: 0,
      x: direction === 'forward' ? 300 : -300,
    },
    animate: {
      opacity: 1,
      x: 0,
    },
    exit: {
      opacity: 0,
      x: direction === 'forward' ? -300 : 300,
    },
  };

  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          duration: 0.2,
          ease: 'easeInOut',
        }}
        onAnimationComplete={() => {
          // Restore focus to main content after animation
          document.querySelector('main')?.focus({ preventScroll: true });
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}