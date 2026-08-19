import type { Metadata } from "next";

import { TransactionsView } from "./transactions-view";

export const metadata: Metadata = {
  title: "Transactions",
  description: "The full scored buffer, filterable and sortable, newest first.",
};

export default function TransactionsPage() {
  return <TransactionsView />;
}
