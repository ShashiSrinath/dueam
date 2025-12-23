import { createFileRoute } from "@tanstack/react-router";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/_inbox/")({
  component: InboxIndex,
});

function InboxIndex() {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <Mail className="w-16 h-16 mx-auto mb-4 opacity-10" />
        <p>Select an email to read</p>
      </div>
    </div>
  );
}
