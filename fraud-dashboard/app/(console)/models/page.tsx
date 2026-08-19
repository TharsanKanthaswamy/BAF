import type { Metadata } from "next";

import { ModelsView } from "./models-view";

export const metadata: Metadata = {
  title: "Models",
  description:
    "How the autoencoder, the isolation forest and the rule set voted, plus the artefacts the engine has loaded.",
};

export default function ModelsPage() {
  return <ModelsView />;
}
