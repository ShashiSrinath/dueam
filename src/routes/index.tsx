import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { format } from "date-fns";
import { Mail, User, Clock, Paperclip, Trash2, Archive, MailOpen, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { z } from "zod";
import DOMPurify from "dompurify";
import { useVirtualizer } from "@tanstack/react-virtual";

const inboxSearchSchema = z.object({
  accountId: z.number().optional(),
  folderId: z.number().optional(),
  filter: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: inboxSearchSchema,
  component: InboxView,
});

type Email = {
  id: number;
  account_id: number;
  folder_id: number;
  remote_id: string;
  message_id: string | null;
  subject: string | null;
  sender_name: string | null;
  sender_address: string;
  date: string;
  flags: string;
  snippet: string | null;
  has_attachments: boolean;
};

type EmailContent = {
  body_text: string | null;
  body_html: string | null;
};

type Attachment = {
  id: number;
  email_id: number;
  filename: string | null;
  mime_type: string | null;
  size: number;
};

export function InboxView() {
  const { accountId, folderId, filter } = Route.useSearch();
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [emailContent, setEmailContent] = useState<EmailContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllSelected = emails.length > 0 && selectedIds.size === emails.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < emails.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emails.map((e) => e.id)));
    }
  };

  const fetchEmails = async () => {
    try {
      setLoading(true);
      const data = await invoke<Email[]>("get_emails", { 
        accountId: accountId || null, 
        folderId: folderId || null,
        filter: filter || null
      });
      setEmails(data);
      setSelectedIds(new Set());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (ids: number[]) => {
    try {
      await invoke("mark_as_read", { emailIds: ids });
      // The backend emits "emails-updated", which triggers fetchEmails via the listener
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const fetchEmailContent = async (id: number) => {
    try {
      setLoadingContent(true);
      const [content, atts] = await Promise.all([
        invoke<EmailContent>("get_email_content", { emailId: id }),
        invoke<Attachment[]>("get_attachments", { emailId: id })
      ]);
      setEmailContent(content);
      setAttachments(atts);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingContent(false);
    }
  };

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

  useEffect(() => {
    fetchEmails();

    const unlisten = listen("emails-updated", () => {
      fetchEmails();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [accountId, folderId, filter]);

  useEffect(() => {
    if (selectedEmailId) {
      fetchEmailContent(selectedEmailId);
      
      const email = emails.find(e => e.id === selectedEmailId);
      if (email && !email.flags.includes("seen")) {
        markAsRead([selectedEmailId]);
      }
    } else {
      setEmailContent(null);
      setAttachments([]);
    }
  }, [selectedEmailId]);

  const selectedEmail = emails.find((e) => e.id === selectedEmailId);

  const sanitizedHtml = useMemo(() => {
    if (!emailContent?.body_html) return null;
    return DOMPurify.sanitize(emailContent.body_html, {
      USE_PROFILES: { html: true },
      ADD_TAGS: ["style"], 
    });
  }, [emailContent]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Email List */}
      <div className="w-1/3 border-r flex flex-col bg-muted/10">
        <div className="p-4 border-b bg-background flex justify-between items-center h-16 shrink-0">
          <div className="flex items-center gap-3">
             <input 
                type="checkbox" 
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isSomeSelected;
                }}
                onChange={toggleSelectAll}
             />
             <h1 className="text-xl font-bold">
                {filter === "unread" ? "Unread" : filter === "flagged" ? "Flagged" : folderId ? "Folder" : accountId ? "Account" : "Unified Inbox"}
             </h1>
          </div>
          <Badge variant="secondary">{emails.length}</Badge>
        </div>

        {selectedIds.size > 0 && (
          <div className="p-2 border-b bg-background flex items-center justify-between px-4 h-12 shrink-0 animate-in slide-in-from-top duration-200">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <div className="flex items-center gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Archive className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Archive</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
                <Separator orientation="vertical" className="h-4 mx-1" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => markAsRead(Array.from(selectedIds))}
                    >
                      <MailOpen className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mark as read</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Tag className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Label</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}
        
        <div ref={parentRef} className="flex-1 overflow-auto">
          {loading && emails.length === 0 && (
              <div className="p-8 text-center text-muted-foreground animate-pulse">
                Loading emails...
              </div>
          )}
          {!loading && emails.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <Mail className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No emails found</p>
            </div>
          )}
          
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
              transform: 'translateZ(0)',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const email = emails[virtualItem.index];
              const isUnread = !email.flags.includes("seen");
              const isSelected = selectedIds.has(email.id);
              return (
                <button
                  key={email.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  onClick={() => setSelectedEmailId(email.id)}
                  style={{
                    position: 'absolute',
                    top: Math.round(virtualItem.start),
                    left: 0,
                    width: '100%',
                  }}
                  className={cn(
                    "flex items-start gap-4 p-4 text-left border-b transition-colors hover:bg-muted/50 group antialiased",
                    selectedEmailId === email.id && "bg-muted",
                    isSelected && "bg-primary/5",
                    isUnread && !isSelected && "bg-blue-50/30 font-semibold"
                  )}
                >
                  <div className="pt-1 flex flex-col items-center gap-2">
                     <input 
                        type="checkbox" 
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggleSelect(email.id, e as any)}
                        className={cn(
                          "w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary transition-opacity",
                          !isSelected && "opacity-0 group-hover:opacity-100"
                        )}
                     />
                     {isUnread && (
                       <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
                     )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex justify-between items-start">
                      <span className={cn("font-medium truncate text-sm", isUnread && "text-primary font-bold")}>
                        {email.sender_name || email.sender_address}
                      </span>
                      <div className="flex items-center gap-2">
                        {email.has_attachments && <Paperclip className="w-3 h-3 text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(email.date), "MMM d")}
                        </span>
                      </div>
                    </div>
                    <div className={cn("text-xs truncate", isUnread && "text-foreground")}>
                      {email.subject || "(No Subject)"}
                    </div>
                    {email.snippet && (
                      <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1 font-normal">
                        {email.snippet}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedEmail ? (
          <div className="flex flex-col h-full">
            <div className="p-6 border-b space-y-4">
              <h2 className="text-2xl font-bold">{selectedEmail.subject || "(No Subject)"}</h2>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <User className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold block truncate">
                      {selectedEmail.sender_name}
                    </span>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(new Date(selectedEmail.date), "PPP p")}
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground block truncate">
                    &lt;{selectedEmail.sender_address}&gt;
                  </span>
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1 p-8">
              <div className="max-w-4xl mx-auto space-y-8">
                {loadingContent ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-5/6"></div>
                    <div className="h-4 bg-muted rounded w-2/3"></div>
                  </div>
                ) : emailContent ? (
                  <>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      {sanitizedHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans text-sm">
                          {emailContent.body_text || "No content available."}
                        </pre>
                      )}
                    </div>

                    {attachments.length > 0 && (
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
                    )}
                  </>
                ) : (
                  <div className="p-12 border-2 border-dashed rounded-2xl text-center text-muted-foreground bg-muted/5">
                    <p className="text-lg font-medium">Failed to load content.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Mail className="w-16 h-16 mx-auto mb-4 opacity-10" />
              <p>Select an email to read</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}