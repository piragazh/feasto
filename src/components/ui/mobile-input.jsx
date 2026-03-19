import React from 'react';
import { Input } from '@/components/ui/input';

/**
 * MobileInput - Enhanced input with mobile-friendly touch targets
 * Ensures minimum 44px height on mobile for easy interaction
 */
export const MobileInput = React.forwardRef(({ 
  className = '', 
  isMobile = false,
  ...props 
}, ref) => {
  const mobileClass = isMobile ? 'h-12' : 'h-11';
  
  return (
    <Input
      ref={ref}
      className={`${mobileClass} ${className}`}
      {...props}
    />
  );
});

MobileInput.displayName = 'MobileInput';

/**
 * MobileTextarea - Enhanced textarea with mobile-friendly touch targets
 */
export const MobileTextarea = React.forwardRef(({ 
  className = '', 
  isMobile = false,
  ...props 
}, ref) => {
  const mobileClass = isMobile ? 'min-h-[120px]' : 'min-h-[100px]';
  
  return (
    <textarea
      ref={ref}
      className={`flex min-w-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${mobileClass} ${className}`}
      {...props}
    />
  );
});

MobileTextarea.displayName = 'MobileTextarea';