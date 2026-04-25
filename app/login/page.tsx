"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { apiGetWorkspace, apiLogin } from "@/lib/api";
import { setAuthSession } from "@/lib/auth";
import axios from "axios";

export default function LoginPage() {
  const router = useRouter();
  const { push } = useToast();
  const [email, setEmail] = useState("abid@m2hinfotech.com");
  const [password, setPassword] = useState("M2h@123");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>FlowPilot</CardTitle>
          <CardDescription>Log in to your marketing workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="abid@m2hinfotech.com" />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="M2h@123"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-500 hover:text-zinc-700"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            Default login: <span className="font-medium">abid@m2hinfotech.com</span> / <span className="font-medium">M2h@123</span>
          </p>
          <Button
            className="w-full rounded-2xl"
            disabled={loading || !email.trim() || !password.trim()}
            onClick={() => {
              setLoading(true);
              void apiLogin({ email: email.trim(), password })
                .then((res) => {
                  setAuthSession(res.token, res.user);
                  push("Logged in");
                  return apiGetWorkspace()
                    .then((workspace) => {
                      router.replace(workspace.workspaceConfigured ? "/dashboard" : "/workspace-setup");
                    })
                    .catch(() => {
                      router.replace("/workspace-setup");
                    });
                })
                .catch((error: unknown) => {
                  if (axios.isAxiosError(error)) {
                    const detail = error.response?.data?.detail;
                    if (typeof detail === "string" && detail.trim()) {
                      push(detail);
                      return;
                    }
                  }
                  push("Invalid credentials. Create an account first if this is your first login.");
                })
                .finally(() => setLoading(false));
            }}
          >
            {loading ? "Signing in..." : "Login"}
          </Button>
          <p className="text-center text-sm text-zinc-500">
            No account?{" "}
            <Link href="/signup" className="font-medium text-zinc-900 hover:underline">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
