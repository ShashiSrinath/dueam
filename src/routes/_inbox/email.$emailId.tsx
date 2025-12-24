import { createFileRoute, defer, Await } from "@tanstack/react-router";
import { Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format } from "date-fns";
import { Mail, User, Clock, Paperclip, Reply, Forward } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import DOMPurify from "dompurify";
import { useEmailStore, Attachment, EmailContent, Email } from "@/lib/store";
import { SenderSidebar } from "./-components/sender-sidebar";

export const Route = createFileRoute("/_inbox/email/$emailId")({
  loader: async ({ params: { emailId } }) => {
    const id = parseInt(emailId);

    const email = await invoke<Email>("get_email_by_id", { emailId: id });
    const contentPromise = invoke<EmailContent>("get_email_content", { emailId: id });
    const attachmentsPromise = invoke<Attachment[]>("get_attachments", { emailId: id });

    return {
      email,
      deferred: defer(Promise.all([contentPromise, attachmentsPromise])),
    };
  },
  onEnter: ({ params: { emailId } }) => {
    const id = parseInt(emailId);
    useEmailStore.getState().setSelectedEmailId(id);
  },
  component: EmailDetail,
});

function EmailDetail() {
  const { email, deferred } = Route.useLoaderData();
  const setComposer = useEmailStore(state => state.setComposer);

  const handleReply = () => {
    setComposer({
      open: true,
      defaultTo: email.sender_address,
      defaultSubject: email.subject?.startsWith("Re: ") ? email.subject : `Re: ${email.subject}`,
      defaultBody: `<br><br>On ${format(new Date(email.date), "PPP p")}, ${email.sender_name || email.sender_address} wrote:<br><blockquote>${email.snippet || ""}</blockquote>`,
      draftId: undefined
    });
  };

  const handleForward = () => {
    setComposer({
      open: true,
      defaultTo: '',
      defaultSubject: email.subject?.startsWith("Fwd: ") ? email.subject : `Fwd: ${email.subject}`,
      defaultBody: `<br><br>---------- Forwarded message ---------<br>From: ${email.sender_name} &lt;${email.sender_address}&gt;<br>Date: ${format(new Date(email.date), "PPP p")}<br>Subject: ${email.subject}<br><br>${email.snippet || ""}`,
      draftId: undefined
    });
  };

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
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="p-6 border-b bg-background z-10 space-y-4 shrink-0">
          <div className="flex justify-between items-start gap-4">
            <h2 className="text-2xl font-bold flex-1 break-words line-clamp-2">{email.subject || "(No Subject)"}</h2>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleReply}>
                <Reply className="w-4 h-4 mr-2" />
                Reply
              </Button>
              <Button variant="outline" size="sm" onClick={handleForward}>
                <Forward className="w-4 h-4 mr-2" />
                Forward
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center gap-2">
                <span className="font-semibold block truncate">
                  {email.sender_name || email.sender_address}
                </span>
                <span className="text-sm text-muted-foreground flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {format(new Date(email.date), "MMM d, p")}
                </span>
              </div>
              <span className="text-sm text-muted-foreground block truncate">
                {email.sender_address}
              </span>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 bg-email-view">
          <div className="max-w-4xl mx-auto my-8 p-4 md:p-8 bg-background rounded-xl shadow-sm border space-y-8 email-paper overflow-hidden">
            <Suspense fallback={
              <div className="space-y-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            }>
              <Await promise={deferred}>
                {([content, attachments]) => {
                  const sanitizedHtml = content.body_html ? DOMPurify.sanitize(content.body_html, {
                    USE_PROFILES: { html: true },
                    ADD_TAGS: ["style"],
                    FORBID_TAGS: ["script", "iframe", "object", "embed"],
                    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
                  }) : null;

                  return (
                    <>
                      <div 
                        className="prose-email max-w-none"
                        onClick={handleContentClick}
                      >
                        {sanitizedHtml ? (
                          <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans text-sm text-[#1a1a1a]">
                            {content.body_text || "No content available."}
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
                  );
                }}
              </Await>
            </Suspense>
          </div>
        </ScrollArea>
      </div>
      <SenderSidebar address={email.sender_address} name={email.sender_name} />
    </div>
  );
}
