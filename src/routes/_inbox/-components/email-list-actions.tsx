import { ToolbarActions } from "./toolbar-actions";

interface EmailListActionsProps {
  selectedCount: number;
  onArchive: () => void;
  onDelete: () => void;
  onMarkAsRead: () => void;
  onLabel: () => void;
  onMoveToInbox?: () => void;
  showMoveToInbox?: boolean;
}

export function EmailListActions({
  selectedCount,
  onArchive,
  onDelete,
  onMarkAsRead,
  onLabel,
  onMoveToInbox,
  showMoveToInbox,
}: EmailListActionsProps) {
  return (
    <div className="p-2 border-b bg-background flex items-center justify-between px-4 h-12 shrink-0 animate-in slide-in-from-top duration-200">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <ToolbarActions
        onArchive={onArchive}
        onDelete={onDelete}
        onMarkAsRead={onMarkAsRead}
        onLabel={onLabel}
        onMoveToInbox={onMoveToInbox}
        showMoveToInbox={showMoveToInbox}
      />
    </div>
  );
}
