import { Link } from "@tanstack/react-router";
import { format, isToday, isYesterday, isThisYear } from "date-fns";
import { Paperclip, Check, Reply, Forward, Sparkles } from "lucide-react";
import { useMemo, memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Email, useEmailStore } from "@/lib/store";
import { useSettingsStore } from "@/lib/settings-store";
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

export const EmailListItem = memo(function EmailListItem({
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
  
  // Granular store subscriptions
  const account = useEmailStore(state => state.accountsMap[email.account_id]);
  const aiEnabled = useSettingsStore(state => state.settings.aiEnabled);
  const aiSummarizationEnabled = useSettingsStore(state => state.settings.aiSummarizationEnabled);

  const date = useMemo(() => {
    const d = new Date(email.date);
    if (isToday(d)) return format(d, "HH:mm");
    if (isYesterday(d)) return "Yesterday";
    if (isThisYear(d)) return format(d, "MMM d");
    return format(d, "MM/dd/yy");
  }, [email.date]);

  const handleClick = useCallback((e: React.MouseEvent) => {
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
  }, [isDraft, email.id, email.sender_address, email.subject, email.snippet, setComposer]);

  const handleAvatarClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) {
      onSelectRange(email.id);
    } else {
      onToggleSelect(email.id);
    }
  }, [email.id, onSelectRange, onToggleSelect]);

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
        "flex items-start gap-3 px-4 py-3 text-left border-b transition-all hover:bg-muted/40 group antialiased relative",
        selectedEmailId === email.id && "bg-muted shadow-[inset_3px_0_0_0_var(--primary)]",
        isSelected && "bg-primary/5",
        isUnread && !isSelected && "bg-primary/[0.02]"
      )}
    >
      {/* Unread Indicator Dot */}
      {isUnread && !isSelected && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] shadow-primary/50" />
      )}

      <div className="flex flex-col items-center justify-center pt-0.5 shrink-0">
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
              "transition-all duration-400 ease-in-out size-9",
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
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex justify-between items-baseline">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className={cn(
              "truncate text-[14px] transition-colors", 
              isUnread ? "font-bold text-foreground" : "font-semibold text-muted-foreground group-hover:text-foreground"
            )}>
              {email.sender_name || email.sender_address}
            </span>
            
            {email.thread_count && email.thread_count > 1 && (
              <span className="text-[10px] bg-muted/80 px-1.5 py-0.5 rounded-md font-bold text-muted-foreground/70 tabular-nums">
                {email.thread_count}
              </span>
            )}

            {account && (
              <div 
                title={account.data.email}
                className="w-1.5 h-1.5 rounded-full bg-primary/30 flex-shrink-0" 
              />
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {email.has_attachments && <Paperclip className="w-3 h-3 text-muted-foreground/60" />}
            <span className="text-[11px] font-medium text-muted-foreground/70 whitespace-nowrap tabular-nums">
              {date}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {email.is_reply && <Reply className="w-3 h-3 text-primary/60 shrink-0" />}
          {email.is_forward && <Forward className="w-3 h-3 text-primary/60 shrink-0" />}
          <div className={cn(
            "text-[13px] truncate flex-1", 
            isUnread ? "text-foreground/90 font-medium" : "text-muted-foreground font-normal"
          )}>
            {email.subject || "(No Subject)"}
          </div>
        </div>

        {email.summary && aiEnabled && aiSummarizationEnabled ? (
          <div className="mt-1.5 p-2 rounded-lg bg-primary/[0.04] border border-primary/10 group-hover:bg-primary/[0.07] transition-colors shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="text-[12px] text-foreground/85 line-clamp-2 font-medium leading-snug flex gap-2 items-start">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/80" />
              <span>{email.summary}</span>
            </div>
          </div>
        ) : email.snippet ? (
          <div className="text-[12px] text-muted-foreground/80 line-clamp-2 mt-0.5 font-normal leading-relaxed">
            {email.snippet}
          </div>
        ) : null}
      </div>
    </Link>
  );
});