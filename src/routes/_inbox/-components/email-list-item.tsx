import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Paperclip, Check, Reply, Forward } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Email, useEmailStore } from "@/lib/store";
import { SenderAvatar } from "@/components/sender-avatar";

interface EmailListItemProps {
  email: Email;
  isSelected: boolean;
  isUnread: boolean;
  selectedEmailId: number | null;
  onToggleSelect: (id: number) => void;
  onSelectRange: (id: number) => void;
  virtualItem: {
    index: number;
    start: number;
  };
  measureElement: (el: HTMLElement | null) => void;
}

export function EmailListItem({
  email,
  isSelected,
  isUnread,
  selectedEmailId,
  onToggleSelect,
  onSelectRange,
  virtualItem,
  measureElement,
}: EmailListItemProps) {
  const isDraft = email.folder_id === -1;
  const setComposer = useEmailStore(state => state.setComposer);
  const accounts = useEmailStore(state => state.accounts);
  const account = useMemo(() => accounts.find(a => a.data.id === email.account_id), [accounts, email.account_id]);

  const handleClick = (e: React.MouseEvent) => {
    if (isDraft) {
      e.preventDefault();
      setComposer({
        open: true,
        draftId: email.id,
        defaultTo: email.sender_address === "(No Recipient)" ? "" : email.sender_address,
        defaultSubject: email.subject === "(No Subject)" ? "" : email.subject || "",
        defaultBody: email.snippet || "",
      });
    }
  };

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      onSelectRange(email.id);
    } else {
      onToggleSelect(email.id);
    }
  };

  return (
    <Link
      to={isDraft ? "." : "/email/$emailId"}
      params={isDraft ? {} : { emailId: email.id.toString() }}
      search={(prev) => prev}
      onClick={handleClick}
      data-index={virtualItem.index}
      ref={measureElement}
      style={{
        position: 'absolute',
        top: Math.round(virtualItem.start),
        left: 0,
        width: '100%',
      }}
      preload={"intent"}
      className={cn(
        "flex items-start gap-4 p-4 text-left border-b transition-all hover:bg-muted/50 group antialiased",
        selectedEmailId === email.id && "bg-muted shadow-[inset_3px_0_0_0_theme(colors.primary.DEFAULT)]",
        isSelected && "bg-primary/5",
        isUnread && !isSelected && "bg-blue-50/30"
      )}
    >
      <div className="flex flex-col items-center justify-center pt-1">
        <div 
          onClick={handleAvatarClick}
          className="relative cursor-pointer"
          role="checkbox"
          aria-checked={isSelected}
        >
          <SenderAvatar 
            address={email.sender_address}
            name={email.sender_name}
            avatarClassName={cn(
              "transition-all duration-400 ease-in-out",
              isSelected ? "scale-0 opacity-0" : "scale-100 opacity-100"
            )}
          />
          
          <div className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full transition-all duration-400 ease-in-out border-2",
            isSelected 
              ? "bg-primary border-primary scale-100 opacity-100" 
              : "bg-background border-muted-foreground/30 scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100"
          )}>
            <Check className={cn(
              "size-5 text-primary-foreground transition-transform duration-400 ease-in-out",
              isSelected ? "scale-100" : "scale-0 group-hover:scale-100"
            )} />
          </div>
        </div>
        {isUnread && !isSelected && (
          <div className="mt-2 w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {email.is_reply && <Reply className="w-3 h-3 text-muted-foreground shrink-0" />}
            {email.is_forward && <Forward className="w-3 h-3 text-muted-foreground shrink-0" />}
            <span className={cn(
              "truncate text-sm", 
              isUnread ? "font-bold text-foreground" : "font-medium text-muted-foreground"
            )}>
              {email.sender_name || email.sender_address}
            </span>
            {email.thread_count && email.thread_count > 1 && (
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full font-medium text-muted-foreground">
                {email.thread_count}
              </span>
            )}
            {account && (
              <div 
                title={account.data.email}
                className="w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" 
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {email.has_attachments && <Paperclip className="w-3 h-3 text-muted-foreground" />}
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {format(new Date(email.date), "MMM d")}
            </span>
          </div>
        </div>
        <div className={cn(
          "text-xs truncate", 
          isUnread ? "text-foreground font-semibold" : "text-muted-foreground font-medium"
        )}>
          {email.subject || "(No Subject)"}
        </div>
        {email.snippet && (
          <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5 font-normal leading-relaxed">
            {email.snippet}
          </div>
        )}
      </div>
    </Link>
  );
}
