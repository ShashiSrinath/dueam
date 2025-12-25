import { createFileRoute, defer, Await } from "@tanstack/react-router";
import { Suspense, useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format } from "date-fns";
import { Mail, Clock, Paperclip, Reply, Forward, ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DOMPurify from "dompurify";
import { useEmailStore, Attachment, EmailContent, Email } from "@/lib/store";
import { SenderSidebar } from "./-components/sender-sidebar";
import { SenderAvatar } from "@/components/sender-avatar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_inbox/email/$emailId")({
  loader: async ({ params: { emailId } }) => {
    const id = parseInt(emailId);
    const email = await invoke<Email>("get_email_by_id", { emailId: id });
    
    // Fetch all emails in the same thread if thread_id exists
    let threadEmails: Email[] = [email];
    if (email.thread_id) {
        threadEmails = await invoke<Email[]>("get_thread_emails", { threadId: email.thread_id });
    }

    return {
      email,
      threadEmails,
    };
  },
  onEnter: ({ params: { emailId } }) => {
    const id = parseInt(emailId);
    useEmailStore.getState().setSelectedEmailId(id);
  },
  component: ThreadView,
});

export function ThreadView() {
  const { email, threadEmails } = Route.useLoaderData();
  const setComposer = useEmailStore(state => state.setComposer);

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="p-6 border-b bg-background z-10 space-y-4 shrink-0">
          <div className="flex justify-between items-start gap-4">
            <h2 className="text-2xl font-bold flex-1 break-words line-clamp-2">{email.subject || "(No Subject)"}</h2>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => {
                setComposer({
                  open: true,
                  defaultTo: email.sender_address,
                  defaultSubject: email.subject?.startsWith("Re: ") ? email.subject : `Re: ${email.subject}`,
                  defaultBody: `<br><br>On ${format(new Date(email.date), "PPP p")}, ${email.sender_name || email.sender_address} wrote:<br><blockquote>${email.snippet || ""}</blockquote>`,
                });
              }}>
                <Reply className="w-4 h-4 mr-2" />
                Reply
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                setComposer({
                  open: true,
                  defaultTo: '',
                  defaultSubject: email.subject?.startsWith("Fwd: ") ? email.subject : `Fwd: ${email.subject}`,
                  defaultBody: `<br><br>---------- Forwarded message ---------
From: ${email.sender_name} &lt;${email.sender_address}&gt;
Date: ${format(new Date(email.date), "PPP p")}
Subject: ${email.subject}

${email.snippet || ""}`,
                });
              }}>
                <Forward className="w-4 h-4 mr-2" />
                Forward
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 bg-email-view">
          <div className="max-w-4xl mx-auto my-8 space-y-4 px-4 pb-20">
            {threadEmails.map((msg, index) => (
              <ThreadMessage 
                key={msg.id} 
                email={msg} 
                isLast={index === threadEmails.length - 1}
                defaultExpanded={index === threadEmails.length - 1 || threadEmails.length === 1}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
      <SenderSidebar address={email.sender_address} name={email.sender_name} />
    </div>
  );
}

function ThreadMessage({ email, isLast, defaultExpanded }: { email: Email, isLast: boolean, defaultExpanded: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [content, setContent] = useState<EmailContent | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isExpanded && !content && !loading) {
      setLoading(true);
      Promise.all([
        invoke<EmailContent>("get_email_content", { emailId: email.id }),
        invoke<Attachment[]>("get_attachments", { emailId: email.id })
      ]).then(([c, a]) => {
        setContent(c);
        setAttachments(a);
        setLoading(false);
      }).catch(err => {
        console.error("Failed to fetch message content:", err);
        setLoading(false);
      });
    }
  }, [isExpanded, email.id, content, loading]);

  const handleContentClick = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
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
    <div className={cn(
        "bg-background rounded-xl shadow-sm border overflow-hidden transition-all",
        isExpanded && "email-paper"
    )}>
      {/* Header */}
      <div 
        className={cn(
            "p-4 flex items-center gap-4 select-none cursor-pointer transition-colors",
            isExpanded ? "border-b bg-muted" : "hover:bg-muted/50"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <SenderAvatar 
          address={email.sender_address}
          name={email.sender_name}
          avatarClassName="w-8 h-8"
        />
        <div className="flex-1 min-w-0 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold truncate">
              {email.sender_name || email.sender_address}
            </span>
            {!isExpanded && (
                <span className="text-sm text-muted-foreground truncate italic">
                    {email.snippet}
                </span>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-xs text-muted-foreground">
              {format(new Date(email.date), "MMM d, p")}
            </span>
            <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                }}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4 md:p-8 space-y-6">
          {loading ? (
             <div className="space-y-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
             </div>
          ) : (
            <>
              <EmailBody content={content} onContentClick={handleContentClick} />
              {attachments.length > 0 && (
                <AttachmentsList attachments={attachments} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EmailBody({ content, onContentClick }: { content: EmailContent | null, onContentClick: (e: React.MouseEvent) => void }) {
    const sanitizedHtml = useMemo(() => {
        if (!content?.body_html) return null;
        return DOMPurify.sanitize(content.body_html, {
            USE_PROFILES: { html: true },
            ADD_TAGS: ["style"],
            FORBID_TAGS: ["script", "iframe", "object", "embed"],
            FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
        });
    }, [content?.body_html]);

    // Simple parser for text content to handle quotes
    const renderTextContent = (text: string) => {
        const lines = text.split('\n');
        const groups: { type: 'text' | 'quote', lines: string[] }[] = [];
        
        lines.forEach(line => {
            const isQuote = line.trim().startsWith('>');
            const lastGroup = groups[groups.length - 1];
            
            if (lastGroup && ((isQuote && lastGroup.type === 'quote') || (!isQuote && lastGroup.type === 'text'))) {
                lastGroup.lines.push(line);
            } else {
                groups.push({ type: isQuote ? 'quote' : 'text', lines: [line] });
            }
        });

        return (
            <div className="whitespace-pre-wrap font-sans text-sm text-[#1a1a1a]">
                {groups.map((group, i) => (
                    group.type === 'quote' ? (
                        <QuotedContent key={i} text={group.lines.join('\n')} />
                    ) : (
                        <div key={i}>{group.lines.join('\n')}</div>
                    )
                ))}
            </div>
        );
    };

    if (!content) return null;

    return (
        <div className="prose-email max-w-none" onClick={onContentClick}>
            {sanitizedHtml ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
            ) : (
                renderTextContent(content.body_text || "No content available.")
            )}
        </div>
    );
}

function QuotedContent({ text }: { text: string }) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="my-2">
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <MoreHorizontal className="w-4 h-4 mr-2" />
                {isExpanded ? "Hide quoted text" : "Show quoted text"}
            </Button>
            {isExpanded && (
                <div className="border-l-2 border-muted pl-4 mt-2 italic text-muted-foreground">
                    {text}
                </div>
            )}
        </div>
    );
}

function AttachmentsList({ attachments }: { attachments: Attachment[] }) {
    const downloadAttachment = async (att: Attachment) => {
        try {
          const data = await invoke<number[]>("get_attachment_data", { attachmentId: att.id });
          const blob = new Blob([new Uint8Array(data)], { type: att.mime_type || "application/octet-stream" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = att.filename || "attachment";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error("Failed to download attachment:", error);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    return (
        <div className="border-t pt-6">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                <Paperclip className="w-4 h-4" />
                Attachments ({attachments.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {attachments.map((att) => (
                    <button
                    key={att.id}
                    onClick={() => downloadAttachment(att)}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors text-left group"
                    >
                        <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Mail className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                            {att.filename || "Unnamed"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                            {formatSize(att.size)}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}