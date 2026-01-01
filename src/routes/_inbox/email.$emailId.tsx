import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useEmailStore, Email } from "@/lib/store";
import { SenderSidebar } from "./-components/sender-sidebar";
import { ThreadMessage } from "./-components/thread-message";

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

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["thread", email.id],
    queryFn: async ({ pageParam = 0 }) => {
      return await invoke<Email[]>("get_thread_emails", {
        emailId: email.id,
        limit: THREAD_PAGE_SIZE,
        offset: pageParam,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < THREAD_PAGE_SIZE) return undefined;
      return allPages.length * THREAD_PAGE_SIZE;
    },
  });

  const threadEmails = useMemo(() => data?.pages.flat() || [], [data]);

  const markAsRead = useEmailStore((state) => state.markAsRead);
  const moveToTrash = useEmailStore((state) => state.moveToTrash);
  const archiveEmails = useEmailStore((state) => state.archiveEmails);
  const moveToInbox = useEmailStore((state) => state.moveToInbox);

  const displaySubject = useMemo(
    () => normalizeSubject(email.subject),
    [email.subject],
  );

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <div className="px-6 py-4 border-b bg-background z-20 shrink-0 shadow-sm flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold break-words line-clamp-1" title={displaySubject}>
              {displaySubject}
            </h2>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 bg-email-view">
          <div className="max-w-4xl mx-auto w-full py-8 flex flex-col gap-4 px-4">
            {threadEmails.map((msg, index) => (
              <ThreadMessage
                key={msg.id}
                email={msg}
                defaultExpanded={index === 0}
                onArchive={() => archiveEmails([msg.id])}
                onDelete={() => moveToTrash([msg.id])}
                onMarkAsRead={() => markAsRead([msg.id])}
                onMoveToInbox={() => moveToInbox([msg.id])}
                showMoveToInbox={view === "spam" || view === "trash"}
              />
            ))}

            {hasNextPage && (
              <div className="py-4 flex justify-center">
                <Button
                  variant="ghost"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isFetchingNextPage ? "Loading..." : "Load older messages"}
                </Button>
              </div>
            )}
            {isLoading && threadEmails.length === 0 && (
              <div className="py-8 text-center text-muted-foreground animate-pulse">
                Loading thread...
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      <SenderSidebar address={email.sender_address} name={email.sender_name} />
    </div>
  );
}