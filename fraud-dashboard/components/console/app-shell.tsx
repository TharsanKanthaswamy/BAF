"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { useConsole } from "@/components/console/console-provider";
import { ConsoleBar } from "@/components/console/console-bar";
import { SideNav } from "@/components/console/side-nav";
import { countBuffer } from "@/components/console/use-console-data";

/**
 * The frame every route renders inside: a fixed navigation rail, a persistent
 * bar, and one scrolling content column.
 *
 * This is the structural difference between an operator console and a dashboard.
 * The rail and the bar never move, so the location of every control is learnable
 * and the same at 3am as at midday; only the column between them changes. It also
 * means a page is free to be exactly as long as its subject needs, instead of
 * everything competing for one screen.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { rows } = useConsole();
  const pathname = usePathname();

  // Badge counts are derived from the unfiltered buffer on purpose: the nav
  // reports what the engine holds, not what the current filter admits.
  const counts = React.useMemo(() => countBuffer(rows), [rows]);

  return (
    <div className="flex min-h-[100dvh]">
      <SideNav counts={counts} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConsoleBar counts={counts} />
        <main className="min-w-0 flex-1 px-4 pt-5 pb-16 sm:px-6">
          {/* Keyed by pathname so the entrance replays on every navigation.
              React remounts the subtree, which is what restarts the CSS
              animation — a class alone would only ever fire on first paint. */}
          <div key={pathname} className="route-enter">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
