import type { ReactNode } from "react";
import { AiCompletionNotifyBridge } from "@/components/ai-completion-notify-bridge";
import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace-provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <AiCompletionNotifyBridge />
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
