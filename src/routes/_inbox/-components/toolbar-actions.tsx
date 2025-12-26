import { Archive, Trash2, MailOpen, Tag, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

interface ToolbarActionsProps {
  onArchive?: () => void;
  onDelete?: () => void;
  onMarkAsRead?: () => void;
  onLabel?: () => void;
  onMoveToInbox?: () => void;
  showMoveToInbox?: boolean;
}

export function ToolbarActions({
  onArchive,
  onDelete,
  onMarkAsRead,
  onLabel,
  onMoveToInbox,
  showMoveToInbox = false,
}: ToolbarActionsProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {showMoveToInbox && onMoveToInbox && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onMoveToInbox}>
                <Inbox className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Move to Inbox</TooltipContent>
          </Tooltip>
        )}
        
        {onArchive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onArchive}>
                <Archive className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive</TooltipContent>
          </Tooltip>
        )}
        
        {onDelete && (
           <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        )}

        <Separator orientation="vertical" className="h-4 mx-1" />

        {onMarkAsRead && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onMarkAsRead}
              >
                <MailOpen className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mark as read</TooltipContent>
          </Tooltip>
        )}
        
        {onLabel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLabel}>
                <Tag className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Label</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
