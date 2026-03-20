import React from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-mobile';

/**
 * MobileBottomSheet - Renders as drawer on mobile, dropdown on desktop
 * Provides touch-friendly mobile-first UX with 44px+ touch targets
 */
export function MobileBottomSheet({ 
  open, 
  onOpenChange, 
  trigger, 
  title, 
  children,
  className = ''
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={`max-h-[90vh] ${className}`}>
          <DrawerHeader className="flex items-center justify-between">
            {title && <DrawerTitle>{title}</DrawerTitle>}
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu">
                <X className="h-5 w-5" />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6 space-y-2">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // On desktop, render as nothing (parent handles dropdown)
  return null;
}

/**
 * MobileBottomSheetItem - Bottom sheet list item with 44px min touch target
 */
export function MobileBottomSheetItem({ 
  onClick, 
  icon: Icon, 
  label, 
  variant = 'default',
  disabled = false,
  className = ''
}) {
  return (
    <Button
      onClick={onClick}
      variant={variant}
      disabled={disabled}
      className={`w-full justify-start h-12 px-4 ${className}`}
      aria-label={label}
    >
      {Icon && <Icon className="h-5 w-5 mr-3" aria-hidden="true" />}
      <span>{label}</span>
    </Button>
  );
}