import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MobileBottomSheet, MobileBottomSheetItem } from '@/components/ui/mobile-bottom-sheet';
import { ChevronDown } from 'lucide-react';
import { useMediaQuery } from '@/hooks/use-mobile';

/**
 * MobileSelectWrapper - Replaces native <select> and DropdownMenu with MobileBottomSheet on mobile
 * Provides 44px+ touch targets on all platforms
 * Falls back to button-only display on desktop (dropdown menu handles display)
 */
export function MobileSelectWrapper({
  value,
  onChange,
  options, // Array of { value, label, icon? }
  placeholder = 'Select option',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;

  if (!isMobile) {
    // Desktop: button with chevron (dropdown menu parent handles the actual menu)
    return (
      <Button
        variant="outline"
        className={`justify-between ${className}`}
        aria-label={`Select ${placeholder}`}
      >
        <span>{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
      </Button>
    );
  }

  // Mobile: bottom sheet with full options
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className={`justify-between h-11 ${className}`}
        aria-label={`Select ${placeholder}`}
      >
        <span>{selectedLabel}</span>
        <ChevronDown className="h-5 w-5 ml-2 opacity-50" />
      </Button>

      <MobileBottomSheet
        open={open}
        onOpenChange={setOpen}
        title={placeholder}
      >
        {options.map(opt => (
          <MobileBottomSheetItem
            key={opt.value}
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
            icon={opt.icon}
            label={opt.label}
          />
        ))}
      </MobileBottomSheet>
    </>
  );
}