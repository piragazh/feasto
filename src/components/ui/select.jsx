"use client"

import React, { forwardRef, useState, useEffect, useContext, createContext, useCallback } from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
};

// Context to share open state & value between Select wrapper and DrawerContent on mobile
const MobileSelectCtx = createContext(null);

// On mobile we wrap the whole Select so we can intercept open state
const Select = ({ children, value, defaultValue, onValueChange, open: controlledOpen, onOpenChange, ...props }) => {
  const [mounted, setMounted] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [currentValue, setCurrentValue] = useState(value ?? defaultValue ?? '');

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
    <MobileSelectCtx.Provider value={{ isOpen, handleOpenChange, currentValue, handleValueChange }}>
      <SelectPrimitive.Root
        value={value ?? currentValue}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        open={false}  // prevent Radix from opening its own popover on mobile
        onOpenChange={() => {}}
        {...props}
      >
        {children}
      </SelectPrimitive.Root>
    </MobileSelectCtx.Provider>
  );
};

const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

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

// MobileSelectItems extracts SelectItem children from SelectContent for use in the Drawer
const MobileSelectItems = ({ children, onSelect }) => {
  return React.Children.map(children, (child) => {
    if (!child) return null;
    if (child.type === SelectPrimitive.Item || (child.props && child.props.value !== undefined)) {
      return (
        <button
          type="button"
          onClick={() => onSelect(child.props.value)}
          className="flex w-full items-center justify-between px-4 py-3.5 text-base text-left hover:bg-accent active:bg-accent rounded-md min-h-[48px]"
        >
          <span>{child.props.children}</span>
        </button>
      );
    }
    // SelectLabel, SelectSeparator etc — render as-is
    return child;
  });
};

const SelectContent = forwardRef(({ className, children, position = "popper", title, ...props }, ref) => {
  const mobileCtx = useContext(MobileSelectCtx);

  if (mobileCtx) {
    return (
      <Drawer open={mobileCtx.isOpen} onOpenChange={mobileCtx.handleOpenChange}>
        <DrawerContent>
          {title && (
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
            </DrawerHeader>
          )}
          <div className="px-2 pb-6 overflow-y-auto max-h-[60vh]">
            <MobileSelectItems onSelect={(val) => { mobileCtx.handleValueChange(val); mobileCtx.handleOpenChange(false); }}>
              {children}
            </MobileSelectItems>
          </div>
        </DrawerContent>
      </Drawer>
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

const SelectItem = forwardRef(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
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
))
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