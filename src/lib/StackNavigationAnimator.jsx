import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigationStack } from './NavigationStack';

export function StackNavigationAnimator({ children }) {
  const location = useLocation();
  const { depth } = useNavigationStack();
  const [prevDepth, setPrevDepth] = useState(depth);
  const [direction, setDirection] = useState('forward');

  useEffect(() => {
    setDirection(depth >= prevDepth ? 'forward' : 'backward');
    setPrevDepth(depth);
  }, [depth]);

  const variants = {
    initial: { opacity: 0, x: direction === 'forward' ? 300 : -300 },
    animate: { opacity: 1, x: 0 },
    exit:    { opacity: 0, x: direction === 'forward' ? -300 : 300 },
  };

  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}