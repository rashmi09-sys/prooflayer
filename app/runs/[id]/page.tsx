import { notFound } from "next/navigation";
import { loadRunViewFor } from "@/lib/server/run-detail.ts";
import { getViewer } from "@/lib/server/viewer.ts";
import { AppShell } from "@/components/app-shell.tsx";
import { RunStory } from "@/components/neverbreak/run-story.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `Run ${(await params).id}` };
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const detail = await loadRunViewFor(viewer, id);
  if (!detail) notFound();
  return (
    <AppShell projectSlug={detail.run.projectSlug} wide>
      <RunStory initial={detail} readOnly={!viewer.operator} basePath={`/p/${detail.run.projectSlug}`} />
    </AppShell>
  );
}
