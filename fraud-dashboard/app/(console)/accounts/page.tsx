import type { Metadata } from "next";

import { AccountsView } from "./accounts-view";

export const metadata: Metadata = {
  title: "Accounts",
  description:
    "Every account in the scored buffer, ranked by the worst tier it has reached.",
};

export default function AccountsPage() {
  return <AccountsView />;
}
