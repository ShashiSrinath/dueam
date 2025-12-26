import { useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Undo,
  Link as LinkIcon,
  Code,
  Eye,
  Strikethrough
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MenuBarProps {
  editor: any;
  isCodeView: boolean;
  setIsCodeView: (val: boolean) => void;
}

export const MenuBar = ({ editor, isCodeView, setIsCodeView }: MenuBarProps) => {
  if (!editor) return null;

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const mainButtons = [
    {
      icon: <Bold className="w-4 h-4" />,
      title: "Bold",
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive('bold'),
    },
    {
      icon: <Italic className="w-4 h-4" />,
      title: "Italic",
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive('italic'),
    },
    {
      icon: <UnderlineIcon className="w-4 h-4" />,
      title: "Underline",
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: () => editor.isActive('underline'),
    },
    {
      icon: <Strikethrough className="w-4 h-4" />,
      title: "Strikethrough",
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: () => editor.isActive('strike'),
    },
    { type: "separator" as const },
    {
      icon: <List className="w-4 h-4" />,
      title: "Bullet List",
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive('bulletList'),
    },
    {
      icon: <ListOrdered className="w-4 h-4" />,
      title: "Ordered List",
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive('orderedList'),
    },
    { type: "separator" as const },
    {
      icon: <Quote className="w-4 h-4" />,
      title: "Blockquote",
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: () => editor.isActive('blockquote'),
    },
    {
      icon: <LinkIcon className="w-4 h-4" />,
      title: "Insert Link",
      action: setLink,
      isActive: () => editor.isActive('link'),
    },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/5 shrink-0">
      <div className="flex items-center gap-0.5">
        {mainButtons.map((btn, i) => (
          'type' in btn && btn.type === "separator" ? (
            <div key={i} className="w-px h-4 bg-border/60 mx-2" />
          ) : (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "w-9 h-9 rounded-lg transition-all duration-200",
                    (btn as any).isActive?.() 
                      ? "bg-primary/10 text-primary hover:bg-primary/20" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  onClick={(btn as any).action}
                  disabled={isCodeView}
                >
                  {(btn as any).icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px] font-bold uppercase tracking-wider">{(btn as any).title}</TooltipContent>
            </Tooltip>
          )
        ))}
      </div>

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "w-9 h-9 rounded-lg transition-all duration-200", 
                isCodeView ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              onClick={() => setIsCodeView(!isCodeView)}
            >
              {isCodeView ? <Eye className="w-4 h-4" /> : <Code className="w-4 h-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[10px] font-bold uppercase tracking-wider">
            {isCodeView ? "Show Preview" : "Show Source"}
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-border/60 mx-2" />

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={isCodeView}
              >
                <Undo className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] font-bold uppercase tracking-wider">Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={isCodeView}
              >
                <Redo className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-[10px] font-bold uppercase tracking-wider">Redo</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
