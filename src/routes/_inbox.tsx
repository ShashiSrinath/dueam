import { createFileRoute, Outlet, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { Mail, Paperclip, Trash2, Archive, MailOpen, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { z } from "zod";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEmailStore } from "@/lib/store";

const inboxSearchSchema = z.object({
  accountId: z.number().optional(),
  folderId: z.number().optional(),
  filter: z.string().optional(),
});

export const Route = createFileRoute("/_inbox")({
  validateSearch: inboxSearchSchema,
  component: InboxLayout,
});

export function InboxLayout() {
  const { accountId, folderId, filter } = Route.useSearch();
  // @ts-ignore - this might not be available yet but will be in child routes
  const { emailId } = useParams({ strict: false });
  const selectedEmailId = emailId ? parseInt(emailId) : null;

  const emails = useEmailStore(state => state.emails);
  const loadingEmails = useEmailStore(state => state.loadingEmails);
  const selectedIds = useEmailStore(state => state.selectedIds);
  const fetchEmails = useEmailStore(state => state.fetchEmails);
  const toggleSelect = useEmailStore(state => state.toggleSelect);
  const toggleSelectAll = useEmailStore(state => state.toggleSelectAll);
  const markAsRead = useEmailStore(state => state.markAsRead);

  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const isAllSelected = emails.length > 0 && selectedIds.size === emails.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < emails.length;

  useEffect(() => {
    fetchEmails({ accountId, folderId, filter });
  }, [accountId, folderId, filter, fetchEmails]);

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
          {loadingEmails && emails.length === 0 && (
              <div className="p-8 text-center text-muted-foreground animate-pulse">
                Loading emails...
              </div>
          )}
          {!loadingEmails && emails.length === 0 && (
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
                <Link
                  key={email.id}
                  to="/email/$emailId"
                  params={{ emailId: email.id.toString() }}
                  search={(prev) => prev}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: Math.round(virtualItem.start),
                    left: 0,
                    width: '100%',
                  }}
                  preload={"intent"}
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
                        onChange={() => toggleSelect(email.id)}
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
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Email Content */}
      <div className="flex-1 flex flex-col bg-background">
        <Outlet />
      </div>
    </div>
  );
}

