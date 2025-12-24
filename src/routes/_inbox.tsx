import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useEmailStore } from "@/lib/store";
import { EmailListToolbar } from "./_inbox/-components/email-list-toolbar";
import { EmailListActions } from "./_inbox/-components/email-list-actions";
import { EmailList } from "./_inbox/-components/email-list";

const inboxSearchSchema = z.object({
  accountId: z.number().optional(),
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
  const { accountId, view, filter, search } = searchParams;
  const navigate = Route.useNavigate();
  const [localSearch, setLocalSearch] = useState(search || "");

  // @ts-ignore - this might not be available yet but will be in child routes
  const { emailId } = useParams({ strict: false });
  const selectedEmailId = emailId ? parseInt(emailId) : null;

  const emails = useEmailStore(state => state.emails);
  const loadingEmails = useEmailStore(state => state.loadingEmails);
  const hasMore = useEmailStore(state => state.hasMore);
  const selectedIds = useEmailStore(state => state.selectedIds);
  const fetchEmails = useEmailStore(state => state.fetchEmails);
  const fetchMoreEmails = useEmailStore(state => state.fetchMoreEmails);
  const toggleSelect = useEmailStore(state => state.toggleSelect);
  const toggleSelectAll = useEmailStore(state => state.toggleSelectAll);
  const markAsRead = useEmailStore(state => state.markAsRead);

  const isAllSelected = emails.length > 0 && selectedIds.size === emails.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < emails.length;

  useEffect(() => {
    fetchEmails({ accountId, view, filter, search });
  }, [accountId, view, filter, search, fetchEmails]);

  // Sync local search with URL search param
  useEffect(() => {
    setLocalSearch(search || "");
  }, [search]);

  // Debounce search update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== (search || "")) {
        (navigate as any)({
          search: { ...searchParams, search: localSearch || undefined },
        });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch, navigate, search, searchParams]);

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
          onToggleSelectAll={toggleSelectAll}
          title={title}
          emailCount={emails.length}
          searchValue={localSearch}
          onSearchChange={setLocalSearch}
        />

        {selectedIds.size > 0 && (
          <EmailListActions
            selectedCount={selectedIds.size}
            onArchive={() => console.log("Archive", Array.from(selectedIds))}
            onDelete={() => console.log("Delete", Array.from(selectedIds))}
            onMarkAsRead={() => markAsRead(Array.from(selectedIds))}
            onLabel={() => console.log("Label", Array.from(selectedIds))}
          />
        )}

        <EmailList
          emails={emails}
          loadingEmails={loadingEmails}
          selectedIds={selectedIds}
          selectedEmailId={selectedEmailId}
          onToggleSelect={toggleSelect}
          fetchNextPage={fetchMoreEmails}
          hasNextPage={hasMore}
        />
      </div>

      {/* Email Content */}
      <div className="flex-1 flex flex-col bg-background min-h-0">
        <Outlet />
      </div>
    </div>
  );
}

