import { AppShell } from "@/components/console/app-shell";
import { ConsoleProvider } from "@/components/console/console-provider";

/**
 * The console's own layout, wrapped in a route group so it adds a frame without
 * adding a URL segment: `/transactions` stays `/transactions`.
 *
 * The provider is mounted here rather than on any page. Cache Components is not
 * enabled in this project, so per the bundled `preserving-ui-state` guide a page's
 * state is discarded on every navigation — anything that must survive a route
 * change has to live in a layout. That is the buffer, the poll loop and the shared
 * filter, all of which would otherwise be thrown away and refetched every time an
 * analyst moved between the queue and the accounts view.
 */
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <ConsoleProvider>
      <AppShell>{children}</AppShell>
    </ConsoleProvider>
  );
}
