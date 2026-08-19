import type { Metadata } from "next";

import { SettingsView } from "./settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Buffer size, heartbeat interval, table density, and the engine connection.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
