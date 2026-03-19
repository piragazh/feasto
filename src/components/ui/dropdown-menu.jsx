import * as React from "react"
import { useState, useEffect, useContext, createContext, forwardRef } from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Slot } from "@radix-ui/react-slot"
import { Check, ChevronRight, Circle } from "lucide-react"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { cn } from "@/lib/utils"

const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
};

const DropdownCtx = React.createContext({ mobile: false, open: false, onOpenChange: () => {} });

// ─── Root ────────────────────────────────────────────────────────────────────
const DropdownMenu = ({ children, open: extOpen, onOpenChange: extOnChange, modal = true, defaultOpen, ...props }) => {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen || false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const mobile = mounted && isMobile();

  const isControlled = extOpen !== undefined;
  const open = isControlled ? extOpen : internalOpen;
  const handleOpenChange = (val) => {
    if (!isControlled) setInternalOpen(val);
    extOnChange?.(val);
  };

  if (mobile) {
    return (
      <DropdownCtx.Provider value={{ mobile: true, open, onOpenChange: handleOpenChange }}>
        {children}
      </DropdownCtx.Provider>
    );
  }

  return (
    <DropdownCtx.Provider value={{ mobile: false, open, onOpenChange: handleOpenChange }}>
      <DropdownMenuPrimitive.Root
        open={isControlled ? open : undefined}
        defaultOpen={!isControlled ? defaultOpen : undefined}
        onOpenChange={handleOpenChange}
        modal={modal}
        {...props}
      >
        {children}
      </DropdownMenuPrimitive.Root>
    </DropdownCtx.Provider>
  );
};

// ─── Trigger ─────────────────────────────────────────────────────────────────
const DropdownMenuTrigger = React.forwardRef(({ children, asChild, onClick, ...props }, ref) => {
  const { mobile, onOpenChange } = React.useContext(DropdownCtx);

  if (mobile) {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        onClick={(e) => {
          onOpenChange(true);
          onClick?.(e);
        }}
        {...props}
      >
        {children}
      </Comp>
    );
  }

  return (
    <DropdownMenuPrimitive.Trigger ref={ref} asChild={asChild} onClick={onClick} {...props}>
      {children}
    </DropdownMenuPrimitive.Trigger>
  );
});
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

// ─── Content (Bottom Sheet on mobile) ────────────────────────────────────────
const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, children, ...props }, ref) => {
  const { mobile, open, onOpenChange } = React.useContext(DropdownCtx);

  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <div className="overflow-y-auto py-2 px-1 pb-safe-or-6">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
});
DropdownMenuContent.displayName = "DropdownMenuContent";

// ─── Item ─────────────────────────────────────────────────────────────────────
const DropdownMenuItem = React.forwardRef(({ className, inset, asChild, onClick, ...props }, ref) => {
  const { mobile, onOpenChange } = React.useContext(DropdownCtx);

  if (mobile) {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3.5 text-[15px] rounded-lg transition-colors active:bg-accent cursor-default select-none",
          "[&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:opacity-70",
          inset && "pl-10",
          className
        )}
        onClick={(e) => {
          onClick?.(e);
          onOpenChange(false);
        }}
        {...props}
      />
    );
  }

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      asChild={asChild}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2.5 md:py-1.5 text-base md:text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0 min-h-[44px] md:min-h-0",
        inset && "pl-8",
        className
      )}
      onClick={onClick}
      {...props}
    />
  );
});
DropdownMenuItem.displayName = "DropdownMenuItem";

// ─── Separator ───────────────────────────────────────────────────────────────
const DropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) => {
  const { mobile } = React.useContext(DropdownCtx);
  if (mobile) {
    return <div ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />;
  }
  return <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />;
});
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

// ─── Label ───────────────────────────────────────────────────────────────────
const DropdownMenuLabel = React.forwardRef(({ className, inset, ...props }, ref) => {
  const { mobile } = React.useContext(DropdownCtx);
  if (mobile) {
    return (
      <div ref={ref} className={cn("px-4 py-2 text-sm font-semibold text-muted-foreground", inset && "pl-10", className)} {...props} />
    );
  }
  return (
    <DropdownMenuPrimitive.Label ref={ref} className={cn("px-2 py-1.5 text-sm font-semibold", inset && "pl-8", className)} {...props} />
  );
});
DropdownMenuLabel.displayName = "DropdownMenuLabel";

// ─── Group ───────────────────────────────────────────────────────────────────
const DropdownMenuGroup = React.forwardRef((props, ref) => {
  const { mobile } = React.useContext(DropdownCtx);
  if (mobile) return <div ref={ref} {...props} />;
  return <DropdownMenuPrimitive.Group ref={ref} {...props} />;
});
DropdownMenuGroup.displayName = "DropdownMenuGroup";

// ─── RadioGroup ──────────────────────────────────────────────────────────────
const DropdownMenuRadioGroup = React.forwardRef((props, ref) => {
  const { mobile } = React.useContext(DropdownCtx);
  if (mobile) return <div ref={ref} {...props} />;
  return <DropdownMenuPrimitive.RadioGroup ref={ref} {...props} />;
});
DropdownMenuRadioGroup.displayName = "DropdownMenuRadioGroup";

// ─── Portal (no-op on mobile) ────────────────────────────────────────────────
const DropdownMenuPortal = ({ children, ...props }) => {
  const { mobile } = React.useContext(DropdownCtx);
  if (mobile) return <>{children}</>;
  return <DropdownMenuPrimitive.Portal {...props}>{children}</DropdownMenuPrimitive.Portal>;
};

// ─── Sub (desktop only - not meaningful on mobile) ───────────────────────────
const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuSubTrigger = React.forwardRef(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

// ─── Checkbox / Radio Items ───────────────────────────────────────────────────
const DropdownMenuCheckboxItem = React.forwardRef(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuShortcut = ({ className, ...props }) => (
  <span className={cn("ml-auto text-xs tracking-widest opacity-60", className)} {...props} />
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}