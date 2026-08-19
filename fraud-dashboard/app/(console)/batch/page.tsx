import type { Metadata } from "next";

import { BatchView } from "./batch-view";

export const metadata: Metadata = {
  title: "Batch scoring",
  description: "Score a CSV export through the same ensemble the live stream uses.",
};

export default function BatchPage() {
  return <BatchView />;
}
