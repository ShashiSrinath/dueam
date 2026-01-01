import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Reply,
  Forward,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useEmailStore, Attachment, EmailContent, Email } from "@/lib/store";
import { useSettingsStore } from "@/lib/settings-store";
import { SenderAvatar } from "@/components/sender-avatar";
import { cn } from "@/lib/utils";
import { AttachmentsList } from "./attachments-list";
import { EmailBody } from "./email-body";
import { ToolbarActions } from "./toolbar-actions";

export function ThreadMessage({
  email: initialEmail,
  defaultExpanded,
  onArchive,
  onDelete,
  onMarkAsRead,
  onMoveToInbox,
  showMoveToInbox,
}: {
  email: Email;
  defaultExpanded: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
  onMarkAsRead?: () => void;
  onMoveToInbox?: () => void;
  showMoveToInbox?: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isStuck, setIsStuck] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<EmailContent | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const aiEnabled = useSettingsStore(state => state.settings.aiEnabled);
  const aiSummarizationEnabled = useSettingsStore(state => state.settings.aiSummarizationEnabled);

  // Update local email state if prop changes
  useEffect(() => {
    setEmail(initialEmail);
  }, [initialEmail]);

  const handleRegenerateSummary = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRegenerating) return;
    
    setIsRegenerating(true);
    try {
      const newSummary = await invoke<string>("regenerate_summary", { emailId: email.id });
      setEmail(prev => ({ ...prev, summary: newSummary }));
      toast.success("Summary regenerated");
    } catch (err) {
      console.error("Failed to regenerate summary:", err);
      toast.error(typeof err === "string" ? err : "Failed to regenerate summary");
    } finally {
      setIsRegenerating(false);
    }
  };

  useEffect(() => {
    // Listen for updates to this specific email (e.g. summary generated)
    const unlistenPromise = listen("emails-updated", async () => {
      // Refresh this specific email's data to get the summary
      try {
        const updatedEmail = await invoke<Email>("get_email_by_id", { emailId: initialEmail.id });
        if (updatedEmail) {
          setEmail(updatedEmail);
        }
      } catch (err) {
        console.error("Failed to refresh thread message:", err);
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [initialEmail.id]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([e]) => {
        setIsStuck(e.intersectionRatio < 1);
      },
      {
        threshold: [1],
        rootMargin: "-1px 0px 1000% 0px",
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isExpanded && !content && !loading) {
      setLoading(true);
      Promise.all([
        invoke<EmailContent>("get_email_content", { emailId: email.id }),
        invoke<Attachment[]>("get_attachments", { emailId: email.id }),
      ])
        .then(([c, a]) => {
          setContent(c);
          setAttachments(a);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to fetch message content:", err);
          setLoading(false);
        });
    }
  }, [isExpanded, email.id, content, loading]);

  const handleContentClick = async (e: React.MouseEvent) => {
    // For Shadow DOM, we need to check the composed path to find the actual element
    const path = e.nativeEvent.composedPath();
    const anchor = path.find((el) => (el as HTMLElement).tagName === "A") as
      | HTMLAnchorElement
      | undefined;

    if (anchor) {
      const href = anchor.getAttribute("href");
      if (href && (href.startsWith("http") || href.startsWith("mailto:"))) {
        e.preventDefault();
        try {
          await openUrl(href);
        } catch (error) {
          console.error("Failed to open link:", error);
        }
      }
    }
  };

  return (
    <div
      className={cn(
        "bg-card text-card-foreground border transition-all flex flex-col shadow-sm relative rounded-xl",
        isExpanded ? "ring-1 ring-primary/5 shadow-md" : "hover:bg-accent/50",
      )}
    >
      {/* Header */}
      <div
        ref={headerRef}
        className={cn(
          "p-4 pt-[17px] flex items-center gap-4 select-none cursor-pointer transition-colors shrink-0 sticky top-[-1px] z-20",
          isExpanded ? "border-b bg-background shadow-sm" : "",
          isStuck && isExpanded ? "rounded-none" : "rounded-t-xl",
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <SenderAvatar
          address={email.sender_address}
          name={email.sender_name}
          avatarClassName="w-10 h-10 border border-border"
        />
        <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
          <div className="flex flex-col min-w-0 gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground text-base truncate">
                {email.sender_name || email.sender_address}
              </span>
              {email.is_reply && (
                <Reply className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              {email.is_forward && (
                <Forward className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
            {!isExpanded ? (
              <span className="text-sm text-muted-foreground truncate italic max-w-[500px]">
                {email.snippet}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground truncate">
                To: {email.recipient_to || "Unknown"}
              </span>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {format(new Date(email.date), "MMM d, p")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-accent -mr-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
            </div>
            
            {isExpanded && (
              <div 
                className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <ToolbarActions
                  onArchive={onArchive}
                  onDelete={onDelete}
                  onMarkAsRead={onMarkAsRead}
                  onMoveToInbox={onMoveToInbox}
                  showMoveToInbox={showMoveToInbox}
                />
                <div className="h-4 w-px bg-border mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors gap-2"
                  aria-label="Reply"
                  onClick={(e) => {
                    e.stopPropagation();
                    const replyBody = content?.body_html || content?.body_text || email.snippet || "";
                    useEmailStore.getState().setComposer({
                      open: true,
                      defaultTo: email.sender_address,
                      defaultSubject: email.subject?.toLowerCase().startsWith("re:")
                        ? email.subject
                        : `Re: ${email.subject}`,
                      defaultBody: `<br><br><div class="gmail_quote">On ${format(new Date(email.date), "PPP p")}, ${email.sender_name || email.sender_address} wrote:<br><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${replyBody}</blockquote></div>`,
                    });
                  }}
                >
                  <Reply className="w-4 h-4" />
                  <span>Reply</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors gap-2"
                  aria-label="Forward"
                  onClick={(e) => {
                    e.stopPropagation();
                    const forwardBody = content?.body_html || content?.body_text || email.snippet || "";
                    useEmailStore.getState().setComposer({
                      open: true,
                      defaultTo: "",
                      defaultSubject: email.subject?.toLowerCase().startsWith("fwd:")
                        ? email.subject
                        : `Fwd: ${email.subject}`,
                      defaultBody: `<br><br>---------- Forwarded message ---------<br>From: <b>${email.sender_name}</b> &lt;${email.sender_address}&gt;<br>Date: ${format(new Date(email.date), "PPP p")}<br>Subject: ${email.subject}<br>To: ${email.recipient_to || ""}<br><br>${forwardBody}`,
                      defaultAttachments: attachments,
                    });
                  }}
                >
                  <Forward className="w-4 h-4" />
                  <span>Forward</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 flex flex-col bg-email-paper rounded-b-xl relative z-10">
          <div className="p-6 md:p-10 flex-1 flex flex-col">
            {loading ? (
              <div className="space-y-4 flex-1">
                <Skeleton className="h-4 w-3/4 opacity-20" />
                <Skeleton className="h-4 w-full opacity-20" />
                <Skeleton className="h-4 w-5/6 opacity-20" />
              </div>
            ) : (
              <div className="space-y-8 flex-1 flex flex-col">
                {email.summary && aiEnabled && aiSummarizationEnabled && (
                  <div className="p-5 rounded-2xl bg-primary/10 text-primary shadow-sm border border-primary/20 relative overflow-hidden group/summary">
                    <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover/summary:opacity-[0.07] transition-opacity">
                      <Sparkles className="w-16 h-16 -mr-4 -mt-4 rotate-12" />
                    </div>
                    <div className="relative z-10 flex gap-4 items-start">
                      <div className="mt-1 p-1.5 rounded-lg bg-primary/20 backdrop-blur-sm">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] uppercase tracking-[0.12em] font-bold opacity-60 mb-1.5">AI Summary</p>
                        <p className="text-[15px] font-medium leading-relaxed">
                          {email.summary}
                        </p>
                      </div>
                      <div className="opacity-0 group-hover/summary:opacity-100 transition-opacity">
                         <Button 
                           variant="ghost" 
                           size="sm" 
                           className="h-8 px-2 text-[10px] uppercase font-bold tracking-wider hover:bg-primary/20 text-primary flex items-center gap-1.5"
                           onClick={handleRegenerateSummary}
                           disabled={isRegenerating}
                         >
                           {isRegenerating ? (
                             <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                           ) : (
                             <RotateCcw className="w-3.5 h-3.5" />
                           )}
                           <span>{isRegenerating ? "Regenerating..." : "Regenerate"}</span>
                         </Button>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="prose-email-container">
                  <EmailBody
                    content={content}
                    onContentClick={handleContentClick}
                  />
                </div>

                {!loading && attachments.length > 0 && (
                   <AttachmentsList attachments={attachments} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
