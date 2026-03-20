import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * StandardHeader - Consistent branded header with back navigation
 * Displays on all non-root-level routes
 * Ensures proper stack navigation across mobile and desktop
 */
export default function StandardHeader({ 
  title = '', 
  showBack = true,
  onBack = null,
  rightContent = null,
  className = ''
}) {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Determine if we should show back button (not on root route)
  const isRootRoute = location.pathname === '/' || location.pathname === '';
  const showBackButton = showBack && !isRootRoute;
  
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className={`bg-white dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0 z-50 ${className}`} style={{ paddingTop: 'env(safe-area-inset-top, 0)' }}>
      <div className="max-w-6xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
        {/* Left: Back button or logo */}
        <div className="flex items-center gap-2 flex-1">
          {showBackButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="rounded-full mr-2"
              aria-label="Go back to previous page"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          {title && (
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white truncate">
              {title}
            </h1>
          )}
        </div>

        {/* Right: Custom content */}
        {rightContent && (
          <div className="flex items-center gap-2">
            {rightContent}
          </div>
        )}
      </div>
    </header>
  );
}