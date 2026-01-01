import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useMemo, useCallback } from "react";
import { z } from "zod";
import { useEmailStore } from "@/lib/store";
import { EmailListToolbar } from "./_inbox/-components/email-list-toolbar";
import { EmailListActions } from "./_inbox/-components/email-list-actions";
import { EmailList } from "./_inbox/-components/email-list";

import { useEmails } from "@/hooks/use-emails";

const inboxSearchSchema = z.object({
  account_id: z.number().optional(),
  view: z.string().optional(),
  filter: z.string().optional(),
  search: z.string().optional(),
});

export const Route = createFileRoute("/_inbox")({
  validateSearch: inboxSearchSchema,
  component: InboxLayout,
});

export function InboxLayout() {
  const searchParams = Route.useSearch();
  const { account_id, view, filter, search } = searchParams;
  const navigate = Route.useNavigate();

  // @ts-ignore - this might not be available yet but will be in child routes
  const { emailId } = useParams({ strict: false });
  const selectedEmailId = emailId ? parseInt(emailId) : null;

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useEmails({ account_id, view, filter, search });

  const emails = useMemo(() => data?.pages.flat() || [], [data]);
  const emailIds = useMemo(() => emails.map(e => e.id), [emails]);

  const selectedIds = useEmailStore((state) => state.selectedIds);
  const toggleSelect = useEmailStore((state) => state.toggleSelect);
  const selectRange = useEmailStore((state) => state.selectRange);
  const toggleSelectAll = useEmailStore((state) => state.toggleSelectAll);
  const markAsRead = useEmailStore((state) => state.markAsRead);
  const moveToTrash = useEmailStore((state) => state.moveToTrash);
  const archiveEmails = useEmailStore((state) => state.archiveEmails);
  const moveToInbox = useEmailStore((state) => state.moveToInbox);

  const handleSelectRange = useCallback((id: number) => {
    selectRange(id, emailIds);
  }, [selectRange, emailIds]);

  const handleToggleSelectAll = useCallback(() => {
    toggleSelectAll(emailIds);
  }, [toggleSelectAll, emailIds]);

  const handleSearchDebounced = useCallback((value: string) => {
    (navigate as any)({
      search: { ...searchParams, search: value || undefined },
    });
  }, [navigate, searchParams]);

  const isAllSelected = emails.length > 0 && selectedIds.size === emails.length;
  const isSomeSelected =
    selectedIds.size > 0 && selectedIds.size < emails.length;

  const title = useMemo(() => {
    if (search) return "Search Results";
    if (filter === "unread") return "Unread";
    if (filter === "flagged") return "Flagged";
    if (view === "others") return "Others";
    if (view === "spam") return "Spam";
    if (view === "sent") return "Sent";
    if (view === "drafts") return "Drafts";
    if (view === "trash") return "Trash";
    if (view === "archive") return "Archive";
    return "Inbox";
  }, [view, filter, search]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Email List */}
      <div className="w-1/3 border-r flex flex-col bg-muted/10 min-h-0">
        <EmailListToolbar
          isAllSelected={isAllSelected}
          isSomeSelected={isSomeSelected}
          onToggleSelectAll={handleToggleSelectAll}
          title={title}
          emailCount={emails.length}
          initialSearchValue={search || ""}
          onSearchDebounced={handleSearchDebounced}
        />

        {selectedIds.size > 0 && (
          <EmailListActions
            selectedCount={selectedIds.size}
            onArchive={() => archiveEmails(Array.from(selectedIds))}
            onDelete={() => moveToTrash(Array.from(selectedIds))}
            onMarkAsRead={() => markAsRead(Array.from(selectedIds))}
            onLabel={() => console.log("Label", Array.from(selectedIds))}
            onMoveToInbox={() => moveToInbox(Array.from(selectedIds))}
            showMoveToInbox={view === "spam" || view === "trash"}
          />
        )}

        <EmailList
          emails={emails}
          loadingEmails={isLoading || isFetchingNextPage}
          selectedIds={selectedIds}
          selectedEmailId={selectedEmailId}
          onToggleSelect={toggleSelect}
          onSelectRange={handleSelectRange}
          fetchNextPage={fetchNextPage}
          hasNextPage={hasNextPage}
        />
      </div>

      {/* Email Content */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
