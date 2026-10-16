"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/auth-context";
import { orgService } from "@/lib/services";
import { toast } from "@/lib/toast";

interface InvitePreview {
  organizationName: string;
  email: string;
  roleName: string;
  memberRole: "OWNER" | "ADMIN" | "MEMBER";
}

const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;

export default function JoinOrgPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { completeGoogleLogin } = useAuth();

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    orgService
      .previewInvite(token)
      .then((res) => !cancelled && setInvite(res.data?.data))
      .catch((e) => !cancelled && setProblem(errMsg(e, "This invitation isn't valid.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await orgService.acceptInvite(token, { firstName, lastName, password });
      // The invite link already proved the email, so the account is signed in straight away.
      await completeGoogleLogin(res.data.data.token);
      toast.success(`Welcome to ${invite?.organizationName}`);
      router.replace(invite?.memberRole === "MEMBER" ? "/home" : "/org");
    } catch (err: any) {
      toast.error(errMsg(err, "Could not create your account"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mx-3 w-[90%] max-w-md">
        <Card className="w-full rounded-[28px] border border-border/60 bg-[#e7e4eb] shadow-2xl dark:bg-muted/40">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto">
              <Image src="/black.webp" alt="AI Colab" width={90} height={90} className="h-auto dark:hidden" priority />
              <Image src="/white.webp" alt="AI Colab" width={90} height={90} className="hidden h-auto dark:block" priority />
            </div>
            {loading ? null : invite ? (
              <>
                <CardTitle className="text-2xl">Join {invite.organizationName}</CardTitle>
                <CardDescription>
                  You&apos;ve been invited as <b>{invite.roleName}</b>. Create your account to continue.
                </CardDescription>
              </>
            ) : (
              <CardTitle className="text-xl">Invitation unavailable</CardTitle>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : invite ? (
              <form onSubmit={submit} className="space-y-3">
                <Input value={invite.email} disabled aria-label="Email" />
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password (min 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account & join"}
                </Button>
              </form>
            ) : (
              <p className="text-center text-sm text-muted-foreground">{problem} Ask your admin to send a new invite.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
