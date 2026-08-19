"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { formatInteger } from "@/lib/format";
import { Button } from "@/components/ui/button";

/**
 * Paging for a set that can run to hundreds of pages.
 *
 * Step buttons alone would make the tail of a ten-thousand-row buffer effectively
 * unreachable, so first and last are always one click away. The label states the
 * absolute row range rather than only the page number, because "rows 4,951 to
 * 5,000 of 9,830" is the thing an analyst quotes when they hand a case over.
 */
export function Pager({
  page,
  pageCount,
  start,
  shown,
  total,
  unit,
  label,
  onPage,
}: {
  /** Zero-based, already clamped by the caller. */
  page: number;
  pageCount: number;
  /** Zero-based index of the first row on this page. */
  start: number;
  shown: number;
  total: number;
  /** Plural noun for the row range, e.g. "Rows" or "Accounts". */
  unit?: string;
  /** Accessible name for the control group. */
  label: string;
  onPage: (page: number) => void;
}) {
  const first = page === 0;
  const last = page >= pageCount - 1;

  return (
    <nav
      aria-label={label}
      className="hairline-t flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
    >
      <p className="figures-tabular text-callout text-muted-foreground">
        {unit ?? "Rows"} {formatInteger(start + 1)}
        <span aria-hidden>–</span>
        <span className="sr-only"> to </span>
        {formatInteger(start + shown)} of {formatInteger(total)}
      </p>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPage(0)}
          disabled={first}
          aria-label="First page"
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPage(page - 1)}
          disabled={first}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <p
          aria-live="polite"
          className="figures-tabular min-w-[6.5rem] text-center text-callout text-muted-foreground"
        >
          Page {formatInteger(page + 1)} of {formatInteger(pageCount)}
        </p>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPage(page + 1)}
          disabled={last}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onPage(pageCount - 1)}
          disabled={last}
          aria-label="Last page"
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
