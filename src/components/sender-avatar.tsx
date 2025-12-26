import { useMemo } from "react";
import { Building2, Check, CircleUser } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSenderInfo } from "@/hooks/use-sender-info";

interface SenderAvatarProps {
  address: string;
  name?: string | null;
  className?: string;
  avatarClassName?: string;
  showVerification?: boolean;
}

export function SenderAvatar({ 
  address, 
  name, 
  className, 
  avatarClassName,
  showVerification = false 
}: SenderAvatarProps) {
  const { sender } = useSenderInfo(address);

  const initials = useMemo(() => {
    // If it's a corporate sender without a clear display name, use the domain name for initials
    if (sender?.company && (!name || name === address)) {
      const part = sender.company.split('.')[0];
      if (part === 'www' && sender.company.split('.').length > 1) {
        return sender.company.split('.')[1].substring(0, 2).toUpperCase();
      }
      return part.substring(0, 2).toUpperCase();
    }

    let displayName = (name || "").trim();
    if (!displayName || displayName === address) {
      // Use local part of email if no name
      displayName = address.split('@')[0].replace(/[._-]/g, ' ');
    }
    
    return displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  }, [name, address, sender?.company]);

  // Generate a consistent background color based on sender address
  const bgColor = useMemo(() => {
    const colors = [
      "bg-red-100 text-red-700",
      "bg-blue-100 text-blue-700",
      "bg-green-100 text-green-700",
      "bg-yellow-100 text-yellow-700",
      "bg-purple-100 text-purple-700",
      "bg-pink-100 text-pink-700",
      "bg-indigo-100 text-indigo-700",
      "bg-orange-100 text-orange-700",
    ];
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = address.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, [address]);

  return (
    <div className={cn("relative flex-shrink-0", className)}>
      <Avatar className={cn("size-9 bg-background", avatarClassName)}>
        {sender?.avatar_url && (
          <AvatarImage src={sender.avatar_url} alt={sender.name || name || ""} />
        )}
        {sender?.company && (
          <>
            <AvatarImage 
              src={`https://icons.duckduckgo.com/ip3/${sender.company}.ico`} 
              alt={sender.company} 
              className="p-1"
            />
            <AvatarImage 
              src={`https://www.google.com/s2/favicons?domain=${sender.company}&sz=128`} 
              alt={sender.company} 
              className="p-1"
            />
          </>
        )}
        <AvatarFallback className={cn(
          "text-[10px] font-bold", 
          sender?.company ? "bg-slate-100 text-slate-600 border" : bgColor
        )}>
          {sender?.company ? (
            <div className="flex flex-col items-center justify-center leading-none scale-90">
              <Building2 className="size-2.5 mb-0.5 opacity-60" />
              {initials}
            </div>
          ) : (
            initials || <CircleUser className="size-5 opacity-80" />
          )}
        </AvatarFallback>
      </Avatar>
      {showVerification && sender?.is_verified && (
        <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1 border-2 border-background shadow-sm">
          <Check className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}
