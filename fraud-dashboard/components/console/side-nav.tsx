"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

import { formatInteger } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NAV_FOOTER, NAV_SECTIONS, type NavItem } from "@/components/console/nav-config";

export interface NavCounts {
  rows: number;
  flagged: number;
  critical: number;
}

/**
 * The brand block with the custom logo image.
 */
export function ConsoleMark() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="relative size-8 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
        <Image
          src="/logo.jpeg"
          alt="Logo"
          width={32}
          height={32}
          className="size-full object-cover"
          priority
        />
      </div>
      <div className="min-w-0">
        <p className="text-title-3 leading-none font-semibold">Sentinel</p>
        <p className="mt-1 truncate text-subheadline leading-none text-muted-foreground">
          Fraud operations
        </p>
      </div>
    </div>
  );
}

function badgeValue(item: NavItem, counts: NavCounts): number | null {
  if (!item.badge) return null;
  const value = counts[item.badge];
  return value > 0 ? value : null;
}

function NavLink({
  item,
  active,
  counts,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  counts: NavCounts;
  onNavigate?: () => void;
}) {
  const count = badgeValue(item, counts);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "pressable group relative flex items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-2.5",
        "text-body outline-none",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      {/* The accent appears once, on the active item. It is the only chromatic
          mark in the whole rail, which is what makes "you are here" instant. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full transition-opacity",
          active ? "opacity-100" : "opacity-0"
        )}
        style={{ background: "var(--brand)" }}
      />
      <item.Icon
        aria-hidden
        className={cn("size-4 shrink-0", active && "text-foreground")}
        strokeWidth={active ? 2 : 1.75}
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count !== null ? (
        <span
          className={cn(
            "figures-tabular shrink-0 rounded-md px-1.5 py-0.5 text-subheadline font-medium",
            item.badge === "flagged"
              ? "bg-[color-mix(in_oklab,var(--severity-high)_14%,transparent)] text-[var(--severity-high)]"
              : "bg-muted text-muted-foreground"
          )}
        >
          {formatInteger(count)}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The navigation rail, shared between the fixed desktop sidebar and the mobile
 * sheet. Both render the same list from the same config, so the two can never
 * drift out of step.
 */
export function NavList({
  counts,
  onNavigate,
  className,
}: {
  counts: NavCounts;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  const isActive = React.useCallback(
    (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href)),
    [pathname]
  );

  return (
    <nav
      aria-label="Console sections"
      className={cn("scroll-thin flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto", className)}
    >
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="text-eyebrow px-2.5 pb-1.5">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  active={isActive(item.href)}
                  counts={counts}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}

      <ul className="mt-auto space-y-0.5 pt-2">
        {NAV_FOOTER.map((item) => (
          <li key={item.href}>
            <NavLink
              item={item}
              active={isActive(item.href)}
              counts={counts}
              onNavigate={onNavigate}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The desktop rail. Its own scroll container and its own plane, so the content
 * column can scroll for a long queue without moving the navigation.
 */
export function SideNav({ counts }: { counts: NavCounts }) {
  return (
    <aside className="hidden w-[15rem] shrink-0 border-r border-border bg-sidebar lg:block">
      <div className="sticky top-0 flex h-dvh flex-col gap-5 px-3 py-4">
        <div className="px-1.5">
          <ConsoleMark />
        </div>
        <NavList counts={counts} />
        <p className="px-2.5 text-subheadline leading-snug text-muted-foreground">
          Internal use only. Every decision recorded here is reviewable.
        </p>
      </div>
    </aside>
  );
}
