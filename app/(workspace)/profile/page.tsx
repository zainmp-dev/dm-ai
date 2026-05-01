"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGetProfile, normalizeProfile } from "@/lib/api";
import { selectWorkspaceShellPending, useWorkspaceStore } from "@/lib/workspace-store";

export default function ProfilePage() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const shellPending = useWorkspaceStore(selectWorkspaceShellPending);
  const saveProfile = useWorkspaceStore((s) => s.saveProfile);
  const { push } = useToast();
  if (shellPending) {
    return <Skeleton className="h-80 w-full rounded-2xl" />;
  }

  if (!workspace) {
    return <p className="text-sm text-zinc-500">Workspace unavailable.</p>;
  }

  return <ProfileForm key={`${workspace.profile.email}-${workspace.profile.name}`} workspace={workspace} saveProfile={saveProfile} push={push} />;
}

function ProfileForm({
  workspace,
  saveProfile,
  push,
}: {
  workspace: NonNullable<ReturnType<typeof useWorkspaceStore.getState>["workspace"]>;
  saveProfile: ReturnType<typeof useWorkspaceStore.getState>["saveProfile"];
  push: (message: string) => void;
}) {
  const [name, setName] = useState(workspace.profile.name);
  const [email, setEmail] = useState(workspace.profile.email);
  const [company, setCompany] = useState(workspace.profile.company);
  const [timezone, setTimezone] = useState(workspace.profile.timezone);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    void apiGetProfile()
      .then((res) => {
        const next = normalizeProfile(res.profile);
        setName(next.name);
        setEmail(next.email);
        setCompany(next.company);
        setTimezone(next.timezone);
      })
      .finally(() => setLoadingProfile(false));
  }, []);

  return (
    <Card className="w-full rounded-2xl border-zinc-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-xl" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tz">Timezone</Label>
          <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" className="rounded-xl" />
        </div>
        <Button
          type="button"
          className="rounded-2xl"
          disabled={loadingProfile}
          onClick={() => {
            void saveProfile({ name, email, company, timezone }).then(() => push("Profile saved"));
          }}
        >
          {loadingProfile ? "Loading profile..." : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}
