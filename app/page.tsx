import { redirect } from "next/navigation";
import { FolderGit2 } from "lucide-react";
import { getViewer, viewerProjects } from "@/lib/server/viewer.ts";
import { AppShell } from "@/components/app-shell.tsx";
import { EmptyState, Panel } from "@/components/ui.tsx";

export const dynamic = "force-dynamic";

/** One link, straight into the workspace: DashDish first. */
export default async function Home() {
  const projects = viewerProjects(await getViewer());
  const first = projects.find((p) => p.slug === "dashdish") ?? projects[0];
  if (first) redirect(`/p/${first.slug}`);
  return (
    <AppShell>
      <Panel>
        <EmptyState icon={<FolderGit2 className="size-5" aria-hidden />} title="Nothing to show yet">
          Run <code className="font-mono text-xs">npm run setup</code> on the server to create the demo projects.
        </EmptyState>
      </Panel>
    </AppShell>
  );
}
