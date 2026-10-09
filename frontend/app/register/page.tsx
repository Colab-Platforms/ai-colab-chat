"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "@/lib/toast";
import Image from "next/image";
import { motion } from "framer-motion";
import { EASE } from "@/components/landing/components/motionVariants";

const getErrorMessage = (err: unknown, fallback: string) => {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof err.response === "object" &&
    err.response !== null &&
    "data" in err.response &&
    typeof err.response.data === "object" &&
    err.response.data !== null &&
    "message" in err.response.data &&
    typeof err.response.data.message === "string"
  ) {
    return err.response.data.message;
  }
  return fallback;
};

export default function RegisterPage() {
  const { register, verifyEmailOtp, resendEmailOtp, login, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"register" | "verify">("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);

  const startGoogleLogin = () => {
    const redirect = searchParams.get("redirect");
    const redirectPath = redirect && redirect.startsWith("/") ? redirect : "/home";
    const apiBaseUrl = (
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"
    ).replace(/\/+$/, "");
    const googleAuthUrl = `${apiBaseUrl}/auth/google/start?redirect=${encodeURIComponent(redirectPath)}`;
    setGoogleLoading(true);
    window.location.assign(googleAuthUrl);
  };

  useEffect(() => {
    if (user && step === "register") {
      const redirect = searchParams.get("redirect");
      router.replace(redirect && redirect.startsWith("/") ? redirect : "/home");
    }
  }, [user, step, router, searchParams]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await register({ firstName, lastName, email, password });
      if (typeof window !== "undefined") {
        localStorage.setItem("signup_free_plan_prompt_pending", "1");
        localStorage.removeItem("signup_free_plan_prompt_seen");
      }
      if (result.requiresEmailVerification) {
        setPendingEmail(email);
        setStep("verify");
        toast.success("Account created. OTP sent to your email");
        setTimer(30);
        return;
      }
      toast.success("Account created and signed in successfully");
      const redirect = searchParams.get("redirect");
      router.replace(redirect && redirect.startsWith("/") ? redirect : "/home");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await verifyEmailOtp(pendingEmail, otp);
      const loginResult = await login(pendingEmail, password);
      if (loginResult.requiresEmailVerification) {
        toast.error("Verification is still pending. Please try again.");
        return;
      }
      toast.success("Email verified and signed in successfully");
      const redirect = searchParams.get("redirect");
      router.replace(redirect && redirect.startsWith("/") ? redirect : "/home");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "OTP verification failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail) {
      toast.error("Please enter your email");
      return;
    }
    setResendLoading(true);
    try {
      await resendEmailOtp(pendingEmail);
      toast.success("OTP resent to your email");
      setTimer(30);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to resend OTP"));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="w-[90%] max-w-md mx-3"
      >
        <Card className="w-full shadow-2xl border border-border/60 rounded-[28px] bg-[#e7e4eb] dark:bg-muted/40  focus-within:ring-1 focus-within:ring-primary/20 transition-all">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto">
              <Image
                src="/black.webp"
                alt="AI Colab"
                width={90}
                height={90}
                className="dark:hidden h-auto"
                priority
              />
              <Image
                src="/white.webp"
                alt="AI Colab"
                width={90}
                height={90}
                className="hidden dark:block h-auto"
                priority
              />
            </div>
            <CardTitle className="text-2xl font-bold text-landing-primary">
              {step === "register" ? "Create account" : "Verify email"}
            </CardTitle>
            <CardDescription className="-mt-3">
              {step === "register"
                ? "Get started with AI Colab Chat"
                : `Enter the OTP sent to ${pendingEmail}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "register" ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-black dark:text-white">
                      First name
                    </label>
                    <Input
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      className="h-11 bg-white/90"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-black dark:text-white">
                      Last name
                    </label>
                    <Input
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      className="h-11 bg-white/90"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-black dark:text-white">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11 bg-white/90"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-black dark:text-white">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="h-11 pr-10 bg-white/90"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-black/50 hover:text-black/80 dark:text-white/50 dark:hover:text-white/80 transition-colors cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 font-medium bg-landing-primary hover:bg-landing-primary-hover text-white"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Create account"
                  )}
                </Button>
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/70" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="bg-[#e7e4eb] dark:bg-muted/40 px-2">or continue with</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 font-medium bg-white"
                  onClick={startGoogleLogin}
                  disabled={googleLoading}
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <svg
                        viewBox="0 0 48 48"
                        aria-hidden="true"
                        className="h-4 w-4"
                      >
                        <path
                          fill="#FFC107"
                          d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
                        />
                        <path
                          fill="#FF3D00"
                          d="M6.3 14.7l6.6 4.8C14.7 15 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                        />
                        <path
                          fill="#4CAF50"
                          d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.2c-2.1 1.6-4.6 2.5-7.3 2.5-5.2 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"
                        />
                        <path
                          fill="#1976D2"
                          d="M43.6 20.5H42V20H24v8h11.3c-1 2.9-2.9 4.2-4 5.1l6.3 5.2C37.2 38.8 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-black dark:text-white">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={pendingEmail}
                    onChange={(e) => setPendingEmail(e.target.value)}
                    required
                    disabled={timer > 0}
                    className="h-11 bg-white/90"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-black dark:text-white">
                    OTP
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                    className="h-11 bg-white/90"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 font-medium bg-landing-primary hover:bg-landing-primary-hover text-white"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Verify email"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  disabled={resendLoading || timer > 0}
                  onClick={handleResend}
                >
                  {resendLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : timer > 0 ? (
                    `Resend OTP in ${timer}s`
                  ) : (
                    "Resend OTP"
                  )}
                </Button>
              </form>
            )}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={`/login${searchParams.get("redirect") ? `?redirect=${encodeURIComponent(searchParams.get("redirect") as string)}` : ""}`}
                className="text-primary hover:text-landing-primary font-medium"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2 text-primary hover:text-landing-primary transition-colors">
          <ArrowLeft className="w-4 h-4 " />
          <Link href="/" className=" font-medium">
            Back to Home
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
