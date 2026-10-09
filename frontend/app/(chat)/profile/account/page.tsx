"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { SettingsCard, SettingsHeader } from "@/components/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { userService } from "@/lib/services";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2, AlertTriangle, Camera, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";

export default function AccountPage() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState(user?.firstName || "");
  const [lastName, setLastName] = useState(user?.lastName || "");
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete account states
  const [showStep1, setShowStep1] = useState(false);
  const [showStep2, setShowStep2] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10MB");
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("firstName", firstName);
      formData.append("lastName", lastName);
      formData.append("phoneNumber", phoneNumber);
      if (selectedFile) {
        formData.append("profileImage", selectedFile);
      }

      await userService.updateProfile(formData);
      await refreshUser();

      // Clear file state after successful save
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }

      toast.success("Profile updated!");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleStep1Continue = () => {
    setShowStep1(false);
    setShowStep2(true);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await userService.delete(user.id);
      toast.success("Account deleted successfully");
      logout();
      router.push("/");
    } catch {
      toast.error("Failed to delete account");
      setDeleting(false);
      setShowStep2(false);
    }
  };

  const displayImage = previewUrl || user?.profileImage;

  const dirty =
    !!selectedFile ||
    firstName !== (user?.firstName || "") ||
    lastName !== (user?.lastName || "") ||
    phoneNumber !== (user?.phoneNumber || "");

  const labelCls = "mb-1.5 block text-[13px] font-medium text-foreground";
  const inputCls = "h-10 rounded-xl border-border bg-surface px-3 text-sm";

  return (
    <div>
      <SettingsHeader title="Account" description="Your profile and sign-in details." />

      <SettingsCard className="p-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="block cursor-pointer rounded-full"
              title="Change photo"
            >
              <Avatar className="h-16 w-16">
                {displayImage ? <AvatarImage src={displayImage} alt="Profile" className="object-cover" /> : null}
                <AvatarFallback className="bg-accent-soft text-xl font-semibold text-accent-ink">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
            </button>
            <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface shadow-cl">
              <Camera className="h-3 w-3 text-muted-foreground" />
            </span>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          </div>
          <div>
            <p className="text-sm font-medium">Profile photo</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Click the avatar to upload a new photo. Max 10 MB.</p>
            {selectedFile && <p className="mt-0.5 text-xs font-medium text-accent-ink">{selectedFile.name}</p>}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>First name</label>
            <Input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Last name</label>
            <Input className={inputCls} value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <div className="flex h-10 items-center justify-between gap-2 rounded-xl bg-sunken px-3 text-sm text-muted-foreground">
              <span className="truncate">{user?.email || ""}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ok">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verified
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-faint">Used to sign in. Contact support to change it.</p>
          </div>
        </div>

        <div className="mt-4 sm:max-w-[calc(33.333%-0.67rem)]">
          <label className={labelCls}>Phone number</label>
          <Input
            className={inputCls}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1234567890"
          />
        </div>

        <div className="mt-6 flex justify-end border-t border-border pt-5">
          <Button onClick={handleSave} disabled={saving || !dirty} className="gap-2 rounded-xl px-5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </SettingsCard>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-surface px-5 py-4">
        <div>
          <p className="text-sm font-medium">Delete account</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Permanently delete your account and all associated data. This can&apos;t be undone.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setShowStep1(true)}
        >
          <Trash2 className="h-4 w-4" /> Delete account
        </Button>
      </div>

      {/* Step 1: Data loss warning */}
      <AlertDialog open={showStep1} onOpenChange={setShowStep1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left space-y-2 text-sm text-muted-foreground">
                <span className="block">This action is <strong>permanent and cannot be undone</strong>. The following will be deleted:</span>
                <ul className="list-disc pl-5 space-y-1">
                  <li>All your chats and conversation history</li>
                  <li>All your folders and organization</li>
                  <li>Your profile and personal data</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleStep1Continue}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Step 2: Subscription / premium warning */}
      <AlertDialog open={showStep2} onOpenChange={setShowStep2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left space-y-2 text-sm text-muted-foreground">
                <span className="block">By deleting your account:</span>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Any <strong>active subscription</strong> will be cancelled immediately</li>
                  <li>You will <strong>lose access</strong> to all premium features</li>
                  <li>Remaining tokens and wallet balance will be forfeited</li>
                </ul>
                <span className="block font-semibold text-destructive mt-2">This cannot be reversed.</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteAccount} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
