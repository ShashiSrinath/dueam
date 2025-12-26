import {
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { PenLine } from "./icons";

interface ComposerHeaderProps {
  subject: string;
  isSaved: boolean;
  isMaximized: boolean;
  setIsMaximized: (val: boolean) => void;
  onClose: () => void;
}

export function ComposerHeader({
  subject,
  isSaved,
  isMaximized,
  setIsMaximized,
  onClose
}: ComposerHeaderProps) {
  return (
    <DialogHeader className="px-12 py-6 border-b flex flex-row items-center justify-between space-y-0 bg-background shrink-0">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
            <PenLine className="w-5 h-5" />
        </div>
        <div>
            <DialogTitle className="text-[17px] font-bold tracking-tight text-foreground/90">
            {subject || "New Message"}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-0.5">
                {isSaved ? (
                    <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5 uppercase tracking-[0.1em] font-bold">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                        Saved to drafts
                    </div>
                ) : (
                    <div className="text-[10px] text-muted-foreground/40 uppercase tracking-[0.1em] font-bold animate-pulse">
                        Editing...
                    </div>
                )}
            </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground/70 hover:text-foreground hover:bg-muted rounded-xl transition-all duration-200"
          onClick={() => setIsMaximized(!isMaximized)}
        >
          {isMaximized ? <Minimize2 className="h-4.5 w-4.5" /> : <Maximize2 className="h-4.5 w-4.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/5 rounded-xl transition-all duration-200"
          onClick={onClose}
        >
          <X className="h-4.5 w-4.5" />
        </Button>
      </div>
    </DialogHeader>
  );
}
