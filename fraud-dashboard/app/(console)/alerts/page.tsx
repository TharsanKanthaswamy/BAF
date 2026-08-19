import type { Metadata } from "next";

import { AlertsView } from "./alerts-view";

export const metadata: Metadata = {
  title: "Alerts",
  description: "Flagged instructions awaiting a human decision, worst tier first.",
};

export default function AlertsPage() {
  return <AlertsView />;
}
