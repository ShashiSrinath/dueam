import { invoke } from "@tauri-apps/api/core";
import { Download, File, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Attachment } from "@/lib/store";

export function AttachmentsList({ attachments }: { attachments: Attachment[] }) {
  const downloadAttachment = async (att: Attachment) => {
    try {
      const data = await invoke<number[]>("get_attachment_data", {
        attachmentId: att.id,
      });
      const blob = new Blob([new Uint8Array(data)], {
        type: att.mime_type || "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename || "attachment";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download attachment:", error);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="flex flex-col gap-3 bg-card py-4 px-6 md:px-10 border-t  mt-8 -mx-6 md:-mx-10 mb-[-24px] md:mb-[-40px] rounded-b-xl">
      <div className="flex items-center gap-2 text-muted-foreground select-none">
        <Paperclip className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{attachments.length} Attachments</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {attachments.map((att) => {
          const filename = att.filename || "Unnamed";
          const lastDot = filename.lastIndexOf(".");
          const name = lastDot > 0 ? filename.slice(0, lastDot) : filename;
          const ext = lastDot > 0 ? filename.slice(lastDot) : "";

          return (
            <div
              key={att.id}
              title={filename}
              className="group flex items-start gap-3 p-3 bg-background border rounded-lg hover:border-primary/50 hover:shadow-sm transition-all relative overflow-hidden"
            >
              <div className="p-2 rounded-md bg-primary/10 text-primary mt-0.5 shrink-0">
                <File className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <div className="flex w-full">
                  <span className="text-sm font-medium text-foreground truncate">
                    {name}
                  </span>
                  <span className="text-sm font-medium text-foreground shrink-0">
                    {ext}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatSize(att.size)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -mr-1 text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0 self-center"
                title="Download"
                onClick={() => downloadAttachment(att)}
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
