"use client"

import React, { forwardRef, useState, useEffect, useContext, createContext, useCallback } from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { createPortal } from "react-dom"

const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
};

// Context to share open state & value between Select wrapper and sheet on mobile
const MobileSelectCtx = createContext(null);

// On mobile we wrap the whole Select so we can intercept open state
const Select = ({ children, value, defaultValue, onValueChange, open: controlledOpen, onOpenChange, ...props }) => {
  const [mounted, setMounted] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [currentValue, setCurrentValue] = useState(value ?? defaultValue ?? '');
  const [labelMap, setLabelMap] = useState({});

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (value !== undefined) setCurrentValue(value); }, [value]);

  const mobile = mounted && isMobile();

  const handleValueChange = useCallback((val) => {
    setCurrentValue(val);
    onValueChange?.(val);
  }, [onValueChange]);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const handleOpenChange = useCallback((o) => {
    if (controlledOpen === undefined) setInternalOpen(o);
    onOpenChange?.(o);
  }, [controlledOpen, onOpenChange]);

  const registerLabel = useCallback((val, label) => {
    if (!val || !label) return;
    setLabelMap(prev => prev[val] === label ? prev : { ...prev, [val]: label });
  }, []);

  if (!mobile) {
    return (
      <SelectPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        open={controlledOpen}
        onOpenChange={onOpenChange}
        {...props}
      >
        {children}
      </SelectPrimitive.Root>
    );
  }

  return (
    <MobileSelectCtx.Provider value={{ isOpen, handleOpenChange, currentValue, handleValueChange, labelMap, registerLabel }}>
      {children}
    </MobileSelectCtx.Provider>
  );
};

const SelectGroup = SelectPrimitive.Group

const SelectValue = ({ placeholder, children, ...props }) => {
  const mobileCtx = useContext(MobileSelectCtx);
  if (mobileCtx) {
    const label = mobileCtx.currentValue ? (mobileCtx.labelMap[mobileCtx.currentValue] ?? mobileCtx.currentValue) : null;
    return (
      <span className="line-clamp-1 text-sm">
        {label || <span className="text-muted-foreground">{placeholder || ''}</span>}
      </span>
    );
  }
  return <SelectPrimitive.Value placeholder={placeholder} {...props}>{children}</SelectPrimitive.Value>;
};

const SelectTrigger = forwardRef(({ className, children, ...props }, ref) => {
  const mobileCtx = useContext(MobileSelectCtx);

  if (mobileCtx) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={() => mobileCtx.handleOpenChange(true)}
        className={cn(
          "flex h-11 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>
    );
  }

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex h-11 md:h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
      {...props}>
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = "SelectTrigger"

const SelectScrollUpButton = forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}>
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}>
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

// Extracts a flat label map {value -> label} from the children tree
const extractLabelMap = (children) => {
  const map = {};
  React.Children.forEach(children, (child) => {
    if (!child) return;
    if (child.props?.value !== undefined) {
      const label = typeof child.props.children === 'string' ? child.props.children : null;
      if (label) map[child.props.value] = label;
    } else if (child.props?.children) {
      Object.assign(map, extractLabelMap(child.props.children));
    }
  });
  return map;
};

// MobileSelectItems renders SelectItem children as tappable buttons in the bottom sheet
const MobileSelectItems = ({ children, onSelect, currentValue }) => {
  return React.Children.map(children, (child) => {
    if (!child) return null;
    // Handle groups recursively
    if (child.props?.children && child.props?.value === undefined) {
      return <MobileSelectItems onSelect={onSelect} currentValue={currentValue}>{child.props.children}</MobileSelectItems>;
    }
    if (child.props?.value !== undefined) {
      const isSelected = child.props.value === currentValue;
      return (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onSelect(child.props.value); }}
          className="flex w-full items-center justify-between px-4 py-3.5 text-base text-left active:bg-accent rounded-md min-h-[48px]"
          style={{ background: isSelected ? 'hsl(var(--accent))' : 'transparent' }}
        >
          <span>{child.props.children}</span>
          {isSelected && <Check className="h-4 w-4 shrink-0" />}
        </button>
      );
    }
    return null;
  });
};

const SelectContent = forwardRef(({ className, children, position = "popper", title, ...props }, ref) => {
  const mobileCtx = useContext(MobileSelectCtx);

  // Always call hook at top level (rules of hooks)
  useEffect(() => {
    if (!mobileCtx) return;
    const map = extractLabelMap(children);
    Object.entries(map).forEach(([val, label]) => mobileCtx.registerLabel(val, label));
  }, [children, mobileCtx]);

  if (mobileCtx) {
    if (!mobileCtx.isOpen) return null;
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
        {/* Backdrop */}
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
          onPointerDown={(e) => { e.stopPropagation(); mobileCtx.handleOpenChange(false); }}
        />
        {/* Sheet */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'white', borderRadius: '12px 12px 0 0',
          maxHeight: '70vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)'
        }}>
          <div style={{ width: 40, height: 4, background: '#d1d5db', borderRadius: 9999, margin: '12px auto 4px' }} />
          {title && <div style={{ padding: '8px 16px', fontWeight: 600, fontSize: 15 }}>{title}</div>}
          <div style={{ overflowY: 'auto', padding: '4px 8px 24px' }}>
            <MobileSelectItems
              onSelect={(val) => { mobileCtx.handleValueChange(val); mobileCtx.handleOpenChange(false); }}
              currentValue={mobileCtx.currentValue}
            >
              {children}
            </MobileSelectItems>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}>
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn("p-1", position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}>
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
})
SelectContent.displayName = "SelectContent"

const SelectLabel = forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", className)}
    {...props} />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = forwardRef(({ className, children, value, ...props }, ref) => {
  const mobileCtx = useContext(MobileSelectCtx);

  if (mobileCtx) {
    return null;
  }

  return (
    <SelectPrimitive.Item
      ref={ref}
      value={value}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-3 md:py-1.5 pl-2 pr-8 text-base md:text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}>
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
})
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = forwardRef(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props} />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}