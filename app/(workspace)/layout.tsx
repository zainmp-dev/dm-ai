import type { ReactNode } from "react";
import { Suspense } from "react";
import { AgentsFlowProvider } from "@/components/agents-flow-provider";
import { AiCompletionNotifyBridge } from "@/components/ai-completion-notify-bridge";
import { AppShell } from "@/components/app-shell";
import { WorkspaceProvider } from "@/components/workspace-provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <AgentsFlowProvider>
        <AiCompletionNotifyBridge />
        <Suspense fallback={null}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </AgentsFlowProvider>
    </WorkspaceProvider>
  );
}
