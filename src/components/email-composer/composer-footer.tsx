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
    <div className="px-6 py-4 border-t bg-muted/5 shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="w-10 h-10 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 rounded-xl transition-all duration-300">
                <Paperclip className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px] font-bold uppercase tracking-wider">Attach files</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="w-10 h-10 text-muted-foreground/70 hover:text-primary hover:bg-primary/10 rounded-xl transition-all duration-300">
                <Smile className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px] font-bold uppercase tracking-wider">Add emoji</TooltipContent>
          </Tooltip>

          <div className="w-px h-6 bg-border/40 mx-2" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="w-10 h-10 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all duration-300 rounded-xl"
                onClick={onDiscard}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px] font-bold uppercase tracking-wider">Discard</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" className="w-10 h-10 text-muted-foreground/40 hover:bg-muted rounded-xl transition-all duration-300">
              <MoreVertical className="w-5 h-5" />
          </Button>

          <Button
            type="submit"
            size="lg"
            className="px-8 h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-[0.97] group relative overflow-hidden"
            disabled={isSending}
          >
            {isSending ? (
              <span className="flex items-center gap-2 text-sm">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Sending...
              </span>
            ) : (
              <span className="flex items-center gap-2 text-sm">
                <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300" />
                <span>Send Message</span>
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
