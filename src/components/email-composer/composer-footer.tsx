import { Button } from "@/components/ui/button";
import {
  Send,
  Paperclip,
  Smile,
  Trash2,
  MoreVertical,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ComposerFooterProps {
  isSending: boolean;
  onDiscard: () => void;
}

export function ComposerFooter({
  isSending,
  onDiscard
}: ComposerFooterProps) {
  return (
    <div className="px-12 py-8 border-t bg-muted/5 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="lg"
            className="px-10 h-14 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-[20px] shadow-xl shadow-primary/20 transition-all active:scale-[0.97] group relative overflow-hidden"
            disabled={isSending}
          >
            {isSending ? (
              <span className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Sending...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300" />
                <span>Send Message</span>
              </span>
            )}
          </Button>

          <div className="w-px h-8 bg-border/40 mx-3" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="w-12 h-12 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 rounded-2xl transition-all duration-300">
                <Paperclip className="w-5.5 h-5.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px] font-bold uppercase tracking-wider">Attach files</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="w-12 h-12 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 rounded-2xl transition-all duration-300">
                <Smile className="w-5.5 h-5.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px] font-bold uppercase tracking-wider">Add emoji</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="w-12 h-12 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all duration-300 rounded-2xl"
                onClick={onDiscard}
              >
                <Trash2 className="w-5.5 h-5.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px] font-bold uppercase tracking-wider">Discard</TooltipContent>
          </Tooltip>

          <Button type="button" variant="ghost" size="icon" className="w-12 h-12 text-muted-foreground/40 hover:bg-muted rounded-2xl transition-all duration-300">
              <MoreVertical className="w-5.5 h-5.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
