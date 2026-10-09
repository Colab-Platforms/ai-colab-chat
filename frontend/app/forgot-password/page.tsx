"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { toast } from "@/lib/toast";
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

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { forgotPassword, resetPassword, user } = useAuth();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (user) {
      router.replace("/home");
    }
  }, [user, router]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
      toast.success("If the email exists, OTP has been sent");
      setStep("reset");
      setTimer(30);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to send OTP"));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email, otp, newPassword);
      toast.success("Password reset successful. Please sign in.");
      router.push("/login");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to reset password"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!email) {
      toast.error("Please enter your email");
      return;
    }
    setResendLoading(true);
    try {
      await forgotPassword(email);
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
              {step === "request" ? "Forgot password" : "Reset password"}
            </CardTitle>
            <CardDescription className="-mt-3">
              {step === "request"
                ? "Get OTP for password-based accounts. Google sign-in accounts should continue with Google."
                : `Enter OTP sent to ${email}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === "request" ? (
              <form onSubmit={handleRequestOtp} className="space-y-4">
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
                <Button
                  type="submit"
                  className="w-full h-11 font-medium bg-landing-primary hover:bg-landing-primary-hover text-white"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Send OTP"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-black dark:text-white">
                    New password
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
                    "Reset password"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  disabled={resendLoading || timer > 0}
                  onClick={handleResendOtp}
                >
                  {resendLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-landing-primary" />
                  ) : timer > 0 ? (
                    `Resend OTP in ${timer}s`
                  ) : (
                    "Resend OTP"
                  )}
                </Button>
              </form>
            )}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Back to{" "}
              <Link
                href="/login"
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
