"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

interface ContactModalProps {
  children: React.ReactNode;
}

export function ContactModal({ children }: ContactModalProps) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call or actual endpoint depending on your backend
    setTimeout(() => {
      setLoading(false);
      toast.success("Message sent successfully! We'll be in touch soon.");
      setOpen(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border-border/50 shadow-2xl border border-border/60 rounded-[28px] bg-background dark:bg-muted/40 dark:backdrop-blur-xl transition-all focus-within:ring-1 focus-within:ring-primary/20 p-8">
        <DialogHeader className="text-center space-y-2 mb-4">
          <DialogTitle className="text-2xl font-bold text-landing-primary">
            Contact Support
          </DialogTitle>
          <DialogDescription className="-mt-1">
            We'd love to hear from you. Please fill out the form below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 text-left">
              <label className="text-sm font-medium text-foreground">
                First Name
              </label>
              <Input required placeholder="John" className="h-11" />
            </div>
            <div className="space-y-2 text-left">
              <label className="text-sm font-medium text-foreground">
                Last Name
              </label>
              <Input required placeholder="Doe" className="h-11" />
            </div>
          </div>
          
          <div className="space-y-2 text-left">
            <label className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input type="email" required placeholder="you@example.com" className="h-11" />
          </div>
          
          <div className="space-y-2 text-left">
            <label className="text-sm font-medium text-foreground">
              Phone Number <span className="text-muted-foreground text-xs font-normal">(Optional)</span>
            </label>
            <Input type="tel" placeholder="+1 (555) 000-0000" className="h-11" />
          </div>
          
          <div className="space-y-2 text-left">
            <label className="text-sm font-medium text-foreground">
              Message
            </label>
            <Textarea 
              required 
              placeholder="How can we help you?" 
              className="min-h-[100px] resize-none" 
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 font-medium bg-landing-primary hover:bg-landing-primary-hover text-white mt-4"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Send Message"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
