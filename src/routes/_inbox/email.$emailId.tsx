import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useEmailStore, Email } from "@/lib/store";
import { SenderSidebar } from "./-components/sender-sidebar";
import { ThreadMessage } from "./-components/thread-message";
import { ToolbarActions } from "./-components/toolbar-actions";

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
  return subject.replace(/^(Re|Fwd|Fw|fw|re|fwd):\s+/gi, "").trim();
};

const THREAD_PAGE_SIZE = 20;

export function ThreadView() {
  const { email } = Route.useLoaderData();
  const search = useSearch({ strict: false }) as any;
  const view = search.view || "primary";

  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  
  const markAsRead = useEmailStore((state) => state.markAsRead);
  const moveToTrash = useEmailStore((state) => state.moveToTrash);
  const archiveEmails = useEmailStore((state) => state.archiveEmails);
  const moveToInbox = useEmailStore((state) => state.moveToInbox);

  const offsetRef = useRef(0);

  const displaySubject = useMemo(
    () => normalizeSubject(email.subject),
    [email.subject],
  );

  const fetchThread = useCallback(
    async (newOffset: number, append: boolean, customLimit?: number) => {
      setLoading(true);
      try {
        const emails = await invoke<Email[]>("get_thread_emails", {
          emailId: email.id,
          limit: customLimit || THREAD_PAGE_SIZE,
          offset: newOffset,
        });

        if (append) {
          setThreadEmails((prev) => [...prev, ...emails]);
        } else {
          setThreadEmails(emails);
        }
        setHasMore(emails.length === (customLimit || THREAD_PAGE_SIZE));
        setOffset(newOffset);
        offsetRef.current = newOffset;
      } catch (err) {
        console.error("Failed to fetch thread:", err);
      } finally {
        setLoading(false);
      }
    },
    [email.id],
  );

  useEffect(() => {
    fetchThread(0, false);

    // Listen for updates to refresh summaries/flags
    const unlistenPromise = listen("emails-updated", () => {
      // Refresh current emails in thread to get updated summaries
      // Fetch everything up to the current offset to avoid losing messages
      const currentLimit = offsetRef.current + THREAD_PAGE_SIZE;
      fetchThread(0, false, currentLimit);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  }, [fetchThread]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    fetchThread(offset + THREAD_PAGE_SIZE, true);
  };

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="px-6 py-4 border-b bg-background z-20 shrink-0 shadow-sm flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold break-words line-clamp-1" title={displaySubject}>
              {displaySubject}
            </h2>
          </div>
          <div className="shrink-0">
            <ToolbarActions 
              onArchive={() => archiveEmails([email.id])}
              onDelete={() => moveToTrash([email.id])}
              onMarkAsRead={() => markAsRead([email.id])}
              onLabel={() => console.log("Label", email.id)}
              onMoveToInbox={() => moveToInbox([email.id])}
              showMoveToInbox={view === "spam" || view === "trash"}
            />
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 bg-email-view">
          <div className="max-w-4xl mx-auto w-full py-8 flex flex-col gap-4 px-4">
            {threadEmails.map((msg, index) => (
              <ThreadMessage
                key={msg.id}
                email={msg}
                defaultExpanded={index === 0}
              />
            ))}

            {hasMore && (
              <div className="py-4 flex justify-center">
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
          </div>
        </ScrollArea>
      </div>
      <SenderSidebar address={email.sender_address} name={email.sender_name} />
    </div>
  );
}