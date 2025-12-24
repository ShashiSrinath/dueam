import { useSenderInfo } from "@/hooks/use-sender-info";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Github, Linkedin, Twitter, Globe, MapPin, Briefcase, History, Building2, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Email, Domain } from "@/lib/store";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";

export function SenderSidebar({ address, name }: { address: string; name?: string | null }) {
  const { sender, loading } = useSenderInfo(address);
  const [recentEmails, setRecentEmails] = useState<Email[]>([]);
  const [domainInfo, setDomainInfo] = useState<Domain | null>(null);

  useEffect(() => {
    if (address) {
      invoke<Email[]>("get_emails_by_sender", { address, limit: 5 })
        .then(setRecentEmails)
        .catch(console.error);
    }
  }, [address]);

  useEffect(() => {
    if (sender?.company) {
      invoke<Domain | null>("get_domain_info", { domain: sender.company })
        .then(setDomainInfo)
        .catch(console.error);
    }
  }, [sender?.company]);

  if (loading && !sender) {
    return (
      <div className="w-80 border-l p-6 space-y-6 hidden xl:block">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-24 h-24 rounded-full bg-muted animate-pulse" />
          <div className="h-6 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  const initials = (name || address)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="w-[320px] max-w-[320px] border-l flex flex-col h-full bg-muted/10 hidden xl:flex shrink-0 min-w-0 overflow-x-hidden">
      <ScrollArea className="flex-1 min-h-0 overflow-x-hidden">
        <div className="p-6 space-y-8 min-w-0 overflow-x-hidden">
          <div className="flex flex-col items-center text-center space-y-4 min-w-0 w-full overflow-hidden">
            <div className="relative">
              <Avatar className="w-24 h-24 border-2 border-background shadow-sm shrink-0">
                <AvatarImage src={sender?.avatar_url || ""} alt={name || ""} />
                <AvatarFallback className="text-2xl font-semibold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {sender?.is_verified && (
                <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1 border-2 border-background shadow-sm">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
            <div className="space-y-1 w-full min-w-0 px-2">
              <h3 className="font-bold text-lg break-words line-clamp-2">{name || sender?.name || address}</h3>
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
                <Avatar className="w-10 h-10 rounded-md shrink-0">
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
    </div>
  );
}
