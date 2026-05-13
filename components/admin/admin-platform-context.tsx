"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminPlatformSession } from "@/lib/api";

const PlatformSessionContext = createContext<AdminPlatformSession | null>(null);

export function AdminPlatformSessionProvider({
  value,
  children,
}: {
  value: AdminPlatformSession | null;
  children: ReactNode;
}) {
  return <PlatformSessionContext.Provider value={value}>{children}</PlatformSessionContext.Provider>;
}

export function useAdminPlatformSession(): AdminPlatformSession | null {
  return useContext(PlatformSessionContext);
}
