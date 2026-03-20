import React from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigationStack } from './NavigationStack';

/**
 * StackNavigationAnimator - Wraps page content with slide animations based on stack depth
 * Animates push (slide left) and pop (slide right) navigation
 */
export function StackNavigationAnimator({ children }) {
  const location = useLocation();
  const { depth } = useNavigationStack();

  // Determine direction based on stack depth change
  const [prevDepth, setPrevDepth] = React.useState(depth);
  const direction = depth > prevDepth ? 'forward' : 'backward';

  React.useEffect(() => {
    setPrevDepth(depth);
  }, [depth]);

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
    <AnimatePresence mode="popLayout">
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{
          duration: 0.25,
          ease: 'easeInOut',
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}