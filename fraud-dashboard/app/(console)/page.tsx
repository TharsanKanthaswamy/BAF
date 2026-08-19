import type { Metadata } from "next";

import { OverviewView } from "./overview-view";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Exposure, review load, throughput and risk composition across the scored buffer.",
};

export default function OverviewPage() {
  return <OverviewView />;
}
