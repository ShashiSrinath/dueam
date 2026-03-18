import { useRef, useEffect, useMemo } from "react";
import { Mail } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Email } from "@/lib/store";
import { EmailListItem } from "./email-list-item";
import { useVisibleEmailSummarization } from "@/hooks/use-visible-email-summarization";

interface EmailListProps {
  emails: Email[];
  loadingEmails: boolean;
  selectedIds: Set<number>;
  selectedEmailId: number | null;
  onToggleSelect: (id: number) => void;
  onSelectRange: (id: number) => void;
  fetchNextPage?: () => void;
  hasNextPage?: boolean;
}

export function EmailList({
  emails,
  loadingEmails,
  selectedIds,
  selectedEmailId,
  onToggleSelect,
  onSelectRange,
  fetchNextPage,
  hasNextPage,
}: EmailListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const visibleEmailIds = useMemo(() => {
    return virtualItems
      .map((virtualItem) => emails[virtualItem.index]?.id)
      .filter((id): id is number => id !== undefined);
  }, [virtualItems, emails]);

  useVisibleEmailSummarization(visibleEmailIds);

  useEffect(() => {
    if (fetchNextPage && hasNextPage && virtualItems.length > 0) {
      const lastItem = virtualItems[virtualItems.length - 1];
      if (lastItem.index >= emails.length - 1 && !loadingEmails) {
        fetchNextPage();
      }
    }
  }, [virtualItems, emails.length, fetchNextPage, hasNextPage, loadingEmails]);

  return (
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
          width: "100%",
          position: "relative",
          transform: "translateZ(0)",
        }}
      >
        {virtualItems.map((virtualItem) => {
          const email = emails[virtualItem.index];
          if (!email) return null;
          const isUnread = !email.flags.includes("seen");
          const isSelected = selectedIds.has(email.id);

          return (
            <EmailListItem
              key={email.id}
              email={email}
              isSelected={isSelected}
              isUnread={isUnread}
              selectedEmailId={selectedEmailId}
              onToggleSelect={onToggleSelect}
              onSelectRange={onSelectRange}
              virtualItem={virtualItem}
              measureElement={virtualizer.measureElement}
            />
          );
        })}
      </div>

      {loadingEmails && emails.length > 0 && (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Loading more emails...
        </div>
      )}
    </div>
  );
}
