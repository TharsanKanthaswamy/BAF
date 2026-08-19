import {
  Boxes,
  FileUp,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Settings,
  Siren,
  Table2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
  /** One line, shown in the nav tooltip and reused as the page description. */
  blurb?: string;
  /**
   * Which live count to print in the nav, if any. Resolved by the shell against
   * the current buffer, because the nav config itself must stay data-free to be
   * importable from a server component.
   */
  badge?: "flagged" | "critical" | "rows";
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * The console's information architecture.
 *
 * Grouped the way a fraud desk actually works rather than by feature: what is
 * happening now, who it is happening to, and the tooling that supports the
 * decision. An analyst on shift lives in the first group and visits the others.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Monitor",
    items: [
      {
        href: "/",
        label: "Overview",
        Icon: LayoutDashboard,
      },
      {
        href: "/transactions",
        label: "Transactions",
        Icon: Table2,
        badge: "rows",
      },
      {
        href: "/alerts",
        label: "Alerts",
        Icon: Siren,
        badge: "flagged",
      },
      {
        href: "/accounts",
        label: "Accounts",
        Icon: Boxes,
      },
    ],
  },
  {
    label: "Analyse",
    items: [
      {
        href: "/models",
        label: "Model health",
        Icon: Gauge,
      },
    ],
  },
  {
    label: "Tools",
    items: [
      {
        href: "/simulator",
        label: "Simulator",
        Icon: FlaskConical,
      },
      {
        href: "/batch",
        label: "Batch scoring",
        Icon: FileUp,
      },
    ],
  },
];

export const NAV_FOOTER: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    Icon: Settings,
  },
];

const ALL_ITEMS = [...NAV_SECTIONS.flatMap((section) => section.items), ...NAV_FOOTER];

/**
 * Longest matching prefix, so `/accounts/ACC_1` still highlights Accounts while
 * `/` only ever matches itself.
 */
export function activeItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of ALL_ITEMS) {
    const matches =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}
