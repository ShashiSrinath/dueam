import { createFileRoute, defer, Await } from "@tanstack/react-router";
import { useMemo, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { format } from "date-fns";
import { Mail, User, Clock, Paperclip } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import DOMPurify from "dompurify";
import { useEmailStore, Attachment, EmailContent } from "@/lib/store";

export const Route = createFileRoute("/_inbox/email/$emailId")({
  loader: ({ params: { emailId } }) => {
    const id = parseInt(emailId);

    const contentPromise = invoke<EmailContent>("get_email_content", { emailId: id });
    const attachmentsPromise = invoke<Attachment[]>("get_attachments", { emailId: id });

    return {
      data: defer(Promise.all([contentPromise, attachmentsPromise])),
    };
  },
  onEnter: ({ params: { emailId } }) => {
    const id = parseInt(emailId);
    useEmailStore.getState().setSelectedEmailId(id);
  },
  component: EmailDetail,
});

function EmailDetail() {
  const { emailId } = Route.useParams();
  const id = parseInt(emailId);
  const { data } = Route.useLoaderData();

  const emails = useEmailStore(state => state.emails);
  const selectedEmail = useMemo(() => emails.find((e) => e.id === id), [emails, id]);

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

  if (!selectedEmail) {
      return (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Email not found.</p>
          </div>
      )
  }

  return (
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
          <Suspense fallback={
            <div className="space-y-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
              <div className="pt-8 space-y-4">
                <Skeleton className="h-4 w-1/4" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
              </div>
            </div>
          }>
            <Await promise={data}>
              {([content, attachments]) => {
                const sanitizedHtml = content.body_html ? DOMPurify.sanitize(content.body_html, {
                  USE_PROFILES: { html: true },
                  ADD_TAGS: ["style"],
                }) : null;

                return (
                  <>
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      {sanitizedHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                      ) : (
                        <pre className="whitespace-pre-wrap font-sans text-sm">
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
  );
}
