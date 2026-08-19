import type { Metadata } from "next";

import { SimulatorView } from "./simulator-view";

export const metadata: Metadata = {
  title: "Simulator",
  description:
    "Score a hand-built instruction, or inject synthetic traffic to exercise the ensemble.",
};

export default function SimulatorPage() {
  return <SimulatorView />;
}
