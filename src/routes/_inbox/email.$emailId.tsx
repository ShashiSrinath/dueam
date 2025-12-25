import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format } from "date-fns";
import { Mail, Paperclip, Reply, Forward, ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import DOMPurify from "dompurify";
import { useEmailStore, Attachment, EmailContent, Email } from "@/lib/store";
import { SenderSidebar } from "./-components/sender-sidebar";
import { SenderAvatar } from "@/components/sender-avatar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_inbox/email/$emailId")({
  loader: async ({ params: { emailId } }) => {
    const id = parseInt(emailId);
    const email = await invoke<Email>("get_email_by_id", { emailId: id });
    return { email };
  },
  onEnter: ({ params: { emailId } }) => {
    const id = parseInt(emailId);
    useEmailStore.getState().setSelectedEmailId(id);
  },
  component: ThreadView,
});

const normalizeSubject = (subject: string | null) => {
    if (!subject) return "(No Subject)";
    return subject.replace(/^(Re|Fwd|Fw|fw|re|fwd):\s+/ig, "").trim();
};

const THREAD_PAGE_SIZE = 20;

export function ThreadView() {
  const { email } = Route.useLoaderData();
  const setComposer = useEmailStore(state => state.setComposer);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const displaySubject = useMemo(() => normalizeSubject(email.subject), [email.subject]);

  const fetchThread = useCallback(async (newOffset: number, append: boolean) => {
    setLoading(true);
    try {
        const emails = await invoke<Email[]>("get_thread_emails", { 
            emailId: email.id, 
            limit: THREAD_PAGE_SIZE, 
            offset: newOffset 
        });
        
        if (append) {
            setThreadEmails(prev => [...prev, ...emails]);
        } else {
            setThreadEmails(emails);
        }
        setHasMore(emails.length === THREAD_PAGE_SIZE);
        setOffset(newOffset);
    } catch (err) {
        console.error("Failed to fetch thread:", err);
    } finally {
        setLoading(false);
    }
  }, [email.id]);

  useEffect(() => {
    fetchThread(0, false);
  }, [fetchThread]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    fetchThread(offset + THREAD_PAGE_SIZE, true);
  };

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="p-6 border-b bg-background z-10 shrink-0 shadow-sm">
          <div className="max-w-4xl mx-auto w-full">
            <div className="flex justify-between items-start gap-4">
              <h2 className="text-2xl font-bold flex-1 break-words line-clamp-2">{displaySubject}</h2>
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
        </div>

        <ScrollArea className="flex-1 min-h-0 bg-email-view">
          <div className="flex flex-col min-h-full">
            {threadEmails.map((msg, index) => (
              <ThreadMessage
                key={msg.id}
                email={msg}
                defaultExpanded={index === 0}
              />
            ))}
            
            {hasMore && (
                <div className="p-8 flex justify-center">
                    <Button 
                        variant="ghost" 
                        onClick={loadMore} 
                        disabled={loading}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        {loading ? "Loading..." : "Load older messages"}
                    </Button>
                </div>
            )}
            
            <div className="h-20 shrink-0" />
          </div>
        </ScrollArea>
      </div>
      <SenderSidebar address={email.sender_address} name={email.sender_name} />
    </div>
  );
}

function ThreadMessage({ email, defaultExpanded }: { email: Email, defaultExpanded: boolean }) {
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
    // For Shadow DOM, we need to check the composed path to find the actual element
    const path = e.nativeEvent.composedPath();
    const anchor = path.find(el => (el as HTMLElement).tagName === 'A') as HTMLAnchorElement | undefined;
    
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
        "bg-card text-card-foreground border-b overflow-hidden transition-all flex flex-col",
        isExpanded ? "flex-grow shrink-0" : "hover:bg-accent/50"
    )}>
      {/* Header */}
      <div
        className={cn(
            "p-6 flex items-center gap-4 select-none cursor-pointer transition-colors shrink-0",
            isExpanded ? "border-b bg-muted/30" : ""
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="max-w-4xl mx-auto w-full flex items-center gap-4">
            <SenderAvatar
            address={email.sender_address}
            name={email.sender_name}
            avatarClassName="w-10 h-10 border border-border"
            />
            <div className="flex-1 min-w-0 flex items-center justify-between">
            <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground text-base truncate">
                    {email.sender_name || email.sender_address}
                    </span>
                    {email.is_reply && <Reply className="w-3.5 h-3.5 text-muted-foreground" />}
                    {email.is_forward && <Forward className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                {!isExpanded && (
                    <span className="text-sm text-muted-foreground truncate italic max-w-[500px]">
                        {email.snippet}
                    </span>
                )}
                {isExpanded && (
                    <span className="text-xs text-muted-foreground truncate">
                        To: {email.sender_address}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                {format(new Date(email.date), "MMM d, p")}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-accent"
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
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 flex flex-col bg-[#f8f9fa] border-t">
            <div className="p-6 md:p-10 max-w-4xl mx-auto w-full flex-1 flex flex-col">
                {loading ? (
                <div className="space-y-4 flex-1">
                    <Skeleton className="h-4 w-3/4 bg-[#e5e7eb]" />
                    <Skeleton className="h-4 w-full bg-[#e5e7eb]" />
                    <Skeleton className="h-4 w-5/6 bg-[#e5e7eb]" />
                </div>
                ) : (
                <div className="space-y-8 flex-1 flex flex-col">
                    <EmailBody content={content} onContentClick={handleContentClick} />
                    {attachments.length > 0 && (
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

function EmailBody({ content, onContentClick }: { content: EmailContent | null, onContentClick: (e: React.MouseEvent) => void }) {
    const shadowRef = useRef<HTMLDivElement>(null);

    const sanitizedHtml = useMemo(() => {
        if (!content?.body_html) return null;
        return DOMPurify.sanitize(content.body_html, {
            USE_PROFILES: { html: true },
            ADD_TAGS: ["style"],
            FORBID_TAGS: ["script", "iframe", "object", "embed"],
            FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
        });
    }, [content?.body_html]);

    useEffect(() => {
        if (shadowRef.current && sanitizedHtml) {
            const container = shadowRef.current;
            let shadow = container.shadowRoot;
            if (!shadow) {
                shadow = container.attachShadow({ mode: "open" });
            }

            shadow.innerHTML = `
                <style>
                    :host {
                        display: block;
                        width: 100%;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        line-height: 1.6;
                        color: #1a1a1a;
                        background-color: transparent;
                        word-wrap: break-word;
                        font-size: 15px;
                    }
                    #content-inner {
                        padding: 1px 0;
                    }
                    img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
                    pre { white-space: pre-wrap; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 4px; font-family: monospace; }
                    a { color: #2563eb; text-decoration: underline; }
                    blockquote { 
                        border-left: 3px solid #cbd5e1;
                        margin: 10px 0 10px 10px; 
                        padding-left: 15px;
                        color: #64748b;
                    }
                    * { max-width: 100%; box-sizing: border-box; }
                </style>
                <div id="content-inner">${sanitizedHtml}</div>
            `;
        }
    }, [sanitizedHtml]);

    // Simple parser for text content to handle quotes
    const renderTextContent = (text: string) => {
        const lines = text.split("\n");
        const groups: { type: "text" | "quote"; lines: string[] }[] = [];

        lines.forEach((line) => {
            const isQuote = line.trim().startsWith(">");
            const lastGroup = groups[groups.length - 1];

            if (
                lastGroup &&
                ((isQuote && lastGroup.type === "quote") ||
                    (!isQuote && lastGroup.type === "text"))
            ) {
                lastGroup.lines.push(line);
            } else {
                groups.push({ type: isQuote ? "quote" : "text", lines: [line] });
            }
        });

        return (
            <div className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-[#1a1a1a] flex-1">
                {groups.map((group, i) =>
                    group.type === "quote" ? (
                        <QuotedContent key={i} text={group.lines.join("\n")} />
                    ) : (
                        <div key={i}>{group.lines.join("\n")}</div>
                    )
                )}
            </div>
        );
    };

    if (!content) return null;

    return (
        <div className="w-full flex-1 flex flex-col min-h-0" onClick={onContentClick}>
            {sanitizedHtml ? (
                <div ref={shadowRef} className="w-full flex-1 min-h-0" />
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
                className="h-6 px-2 text-[#64748b] hover:text-[#1a1a1a] hover:bg-black/5"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <MoreHorizontal className="w-4 h-4 mr-2" />
                {isExpanded ? "Hide quoted text" : "Show quoted text"}
            </Button>
            {isExpanded && (
                <div className="border-l-2 border-[#cbd5e1] pl-4 mt-2 italic text-[#64748b]">
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
        <div className="border-t border-[#cbd5e1] pt-6">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-[#1a1a1a]">
                <Paperclip className="w-4 h-4" />
                Attachments ({attachments.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {attachments.map((att) => (
                    <button
                    key={att.id}
                    onClick={() => downloadAttachment(att)}
                    className="flex items-center gap-3 p-3 border border-[#cbd5e1] rounded-lg hover:bg-black/5 transition-colors text-left group"
                    >
                        <div className="w-10 h-10 rounded bg-[#2563eb]/10 flex items-center justify-center text-[#2563eb] shrink-0">
                            <Mail className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs font-medium truncate text-[#1a1a1a] group-hover:text-[#2563eb] transition-colors">
                            {att.filename || "Unnamed"}
                            </p>
                            <p className="text-[10px] text-[#64748b]">
                            {formatSize(att.size)}
                            </p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
