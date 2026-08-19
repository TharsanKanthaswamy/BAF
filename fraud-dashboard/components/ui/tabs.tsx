"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        // A capsule of glass rather than a grey box. The blur is dialled down
        // from the chrome default: a 40px-tall control blurring at 30px turns to
        // mush, where 16px still separates it from the page behind it.
        "material-control relative inline-flex h-10 items-center gap-0.5 rounded-full p-1",
        "[--glass-blur:16px]",
        className
      )}
      {...props}
    >
      {children}
      <TabsIndicator />
    </TabsPrimitive.List>
  );
}

/**
 * One shared pill that *travels* between tabs rather than four pills fading in
 * and out. The movement is what tells you the two tabs are the same control —
 * and it stays interruptible: change tabs mid-flight and the pill re-targets
 * from wherever it currently is.
 */
function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      className={cn(
        "absolute top-1 left-0 z-0 h-[calc(100%-0.5rem)] rounded-full",
        "bg-[var(--control-thumb)] shadow-[0_1px_3px_rgb(0_0_0/0.12),0_1px_1px_rgb(0_0_0/0.06)]",
        "translate-x-[var(--active-tab-left)] w-[var(--active-tab-width)]",
        "transition-[translate,width] duration-[260ms] ease-[var(--ease-out-quint)]",
        className
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5",
        "text-body font-medium whitespace-nowrap text-muted-foreground outline-none select-none",
        "transition-colors duration-150 ease-[var(--ease-out-quint)]",
        "hover:text-foreground data-[selected]:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  );
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn(
        "outline-none",
        "transition-[opacity,translate] duration-[280ms] ease-[var(--ease-out-quint)]",
        "data-[starting-style]:translate-y-1 data-[starting-style]:opacity-0",
        className
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsPanel, TabsIndicator };
