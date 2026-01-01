import { useSenderInfo } from "@/hooks/use-sender-info";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Github, Linkedin, Twitter, Globe, MapPin, Briefcase, History, Building2, RotateCcw, Edit2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Email, Domain, Sender } from "@/lib/store";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { SenderAvatar } from "@/components/sender-avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SenderSidebar({ address, name: initialName }: { address: string; name?: string | null }) {
  const { sender: initialSender, loading: senderLoading } = useSenderInfo(address, true);
  const [sender, setSender] = useState<Sender | null>(null);
  const [recentEmails, setRecentEmails] = useState<Email[]>([]);
  const [domainInfo, setDomainInfo] = useState<Domain | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    setSender(initialSender || null);
  }, [initialSender]);

  const fetchRecentEmails = useCallback(() => {
    if (address) {
      invoke<Email[]>("get_emails_by_sender", { address, limit: 5 })
        .then(setRecentEmails)
        .catch(console.error);
    }
  }, [address]);

  useEffect(() => {
    setRecentEmails([]);
    fetchRecentEmails();

    const unlistenPromise = listen("emails-updated", () => {
      fetchRecentEmails();
    });

    const unlistenSenderPromise = listen("sender-updated", async (event) => {
        if (event.payload === address) {
            try {
                const updatedSender = await invoke<Sender | null>("get_sender_info", { address });
                if (updatedSender) setSender(updatedSender);
            } catch (err) {
                console.error("Failed to refresh sender info:", err);
            }
        }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
      unlistenSenderPromise.then(unlisten => unlisten());
    };
  }, [address, fetchRecentEmails]);

  useEffect(() => {
    if (sender?.company) {
      invoke<Domain | null>("get_domain_info", { domain: sender.company })
        .then(setDomainInfo)
        .catch(console.error);
    } else {
      setDomainInfo(null);
    }
  }, [sender?.company]);

  const handleRegenerate = async () => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    try {
      const result = await invoke<Sender>("regenerate_sender_info", { address });
      setSender(result);
      toast.success("Sender information regenerated");
    } catch (err) {
      console.error("Failed to regenerate sender info:", err);
      toast.error(typeof err === "string" ? err : "Failed to regenerate sender info");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (senderLoading && !sender) {
    return (
      <div className="w-[320px] border-l p-6 space-y-6 hidden xl:block">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-24 h-24 rounded-full bg-muted animate-pulse" />
          <div className="h-6 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-[320px] max-w-[320px] border-l flex flex-col h-full bg-muted/10 hidden xl:flex shrink-0 min-w-0 overflow-x-hidden">
      <ScrollArea className="flex-1 min-h-0 overflow-x-hidden">
        <div className="p-6 space-y-8 min-w-0 overflow-x-hidden group/sidebar">
          <div className="flex flex-col items-center text-center space-y-4 min-w-0 w-full overflow-hidden relative">
            <div className="absolute top-0 right-0 flex gap-1 opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
               <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={() => setIsEditDialogOpen(true)}
                title="Edit Details"
               >
                 <Edit2 className="w-4 h-4" />
               </Button>
               <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                title="Regenerate Info"
               >
                 <RotateCcw className={cn("w-4 h-4", isRegenerating && "animate-spin")} />
               </Button>
            </div>

            <SenderAvatar
              key={address}
              address={address}
              name={initialName || sender?.name}
              avatarClassName="w-24 h-24 border-2 border-background shadow-sm text-2xl"
              showVerification={true}
            />
            <div className="space-y-1 w-full min-w-0 px-2">
              <h3 className="font-bold text-lg break-words line-clamp-2">{initialName || sender?.name || address}</h3>
              {sender?.job_title && (
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5 truncate">
                  <Briefcase className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{sender.job_title}</span>
                </p>
              )}
            </div>
          </div>

          {sender?.company && (
            <div className="space-y-3 min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-semibold">Company</h4>
              <div className="flex items-center gap-3 p-3 bg-background rounded-lg border shadow-sm min-w-0">
                <Avatar className="w-10 h-10 rounded-md shrink-0" key={sender.company}>
                  <AvatarImage src={domainInfo?.logo_url || ""} />
                  <AvatarFallback className="rounded-md">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate break-words">{sender.company}</div>
                  {domainInfo?.website_url && (
                    <div className="text-[10px] text-muted-foreground truncate">{domainInfo.website_url}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(sender?.location || sender?.website_url) && (
            <div className="space-y-3 min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">About</h4>
              <div className="space-y-2 min-w-0">
                {sender?.location && (
                  <div className="flex items-center gap-2.5 text-sm text-foreground/80 min-w-0">
                    <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{sender.location}</span>
                  </div>
                )}
                {sender?.website_url && (
                  <div className="flex items-center gap-2.5 text-sm text-foreground/80 min-w-0">
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <a
                      href={sender.website_url.startsWith('http') ? sender.website_url : `https://${sender.website_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-all line-clamp-2"
                    >
                      {sender.website_url.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {(sender?.github_handle || sender?.linkedin_handle || sender?.twitter_handle) && (
            <div className="space-y-3 min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground font-semibold">Verified Profiles</h4>
              <div className="flex gap-3">
                {sender?.linkedin_handle && (
                  <a
                    href={sender.linkedin_handle.startsWith('http') ? sender.linkedin_handle : `https://linkedin.com/in/${sender.linkedin_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-[#0077b5]/10 text-[#0077b5] rounded-full hover:bg-[#0077b5]/20 transition-colors"
                    title="LinkedIn Profile"
                  >
                    <Linkedin className="w-5 h-5" />
                  </a>
                )}
                {sender?.twitter_handle && (
                  <a
                    href={sender.twitter_handle.startsWith('http') ? sender.twitter_handle : `https://twitter.com/${sender.twitter_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-foreground/5 text-foreground rounded-full hover:bg-foreground/10 transition-colors"
                    title="X (Twitter) Profile"
                  >
                    <Twitter className="w-5 h-5" />
                  </a>
                )}
                {sender?.github_handle && (
                  <a
                    href={sender.github_handle.startsWith('http') ? sender.github_handle : `https://github.com/${sender.github_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-foreground/5 text-foreground rounded-full hover:bg-foreground/10 transition-colors"
                    title="GitHub Profile"
                  >
                    <Github className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {sender?.bio && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bio</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {sender.bio}
              </p>
            </div>
          )}

          <div className="pt-4 min-w-0">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Email Address</h4>
            <code className="text-[11px] bg-muted px-2 py-1 rounded block break-all border leading-relaxed" title={address}>
              {address}
            </code>
          </div>

          {recentEmails.length > 0 && (
            <div className="space-y-3 pt-4 border-t min-w-0">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                Recent Threads
              </h4>
              <div className="space-y-3 min-w-0">
                {recentEmails.map((email) => (
                  <Link
                    key={email.id}
                    to="/email/$emailId"
                    params={{ emailId: email.id.toString() }}
                    className="block group/item min-w-0"
                  >
                    <div className="text-[13px] font-medium break-words line-clamp-2 group-hover/item:text-primary transition-colors leading-snug">
                      {email.subject || "(No Subject)"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {format(new Date(email.date), "MMM d, yyyy")}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {sender && (
        <EditSenderDialog
          isOpen={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          sender={sender}
        />
      )}
    </div>
  );
}

function EditSenderDialog({ 
  isOpen, 
  onClose, 
  sender 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  sender: Sender 
}) {
  const [formData, setFormData] = useState<Sender>(sender);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(sender);
  }, [sender]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await invoke("update_sender_info", { sender: formData });
      toast.success("Sender updated successfully");
      onClose();
    } catch (err) {
      console.error("Failed to update sender:", err);
      toast.error(typeof err === "string" ? err : "Failed to update sender");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[426px]">
        <DialogHeader>
          <DialogTitle>Edit Sender Details</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input 
              id="name" 
              value={formData.name || ""} 
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="job_title">Job Title</Label>
            <Input 
              id="job_title" 
              value={formData.job_title || ""} 
              onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company">Company</Label>
            <Input 
              id="company" 
              value={formData.company || ""} 
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="location">Location</Label>
            <Input 
              id="location" 
              value={formData.location || ""} 
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="website_url">Website URL</Label>
            <Input 
              id="website_url" 
              value={formData.website_url || ""} 
              onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea 
              id="bio" 
              value={formData.bio || ""} 
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input 
                id="linkedin" 
                placeholder="handle or URL"
                value={formData.linkedin_handle || ""} 
                onChange={(e) => setFormData({ ...formData, linkedin_handle: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="twitter">Twitter / X</Label>
              <Input 
                id="twitter" 
                placeholder="handle or URL"
                value={formData.twitter_handle || ""} 
                onChange={(e) => setFormData({ ...formData, twitter_handle: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="github">GitHub</Label>
            <Input 
              id="github" 
              placeholder="handle or URL"
              value={formData.github_handle || ""} 
              onChange={(e) => setFormData({ ...formData, github_handle: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
