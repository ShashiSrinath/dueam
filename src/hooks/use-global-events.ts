import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useEmailStore } from "@/lib/store";

export function useGlobalEvents() {
  const queryClient = useQueryClient();
  const fetchAccountsAndFolders = useEmailStore(s => s.fetchAccountsAndFolders);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const unlistenEmails = listen("emails-updated", () => {
      // Debounce the invalidation to avoid rapid refetches during bulk operations
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        // Invalidate all email related queries
        queryClient.invalidateQueries({ queryKey: ["emails"] });
        queryClient.invalidateQueries({ queryKey: ["thread"] });
        // Also refresh accounts/folders as unread counts might have changed
        fetchAccountsAndFolders();
      }, 200);
    });

    const unlistenSenders = listen("sender-updated", (event) => {
      const address = event.payload as string;
      queryClient.invalidateQueries({ queryKey: ["sender", address] });
    });

    return () => {
      unlistenEmails.then(u => u());
      unlistenSenders.then(u => u());
      if (timeout) clearTimeout(timeout);
    };
  }, [queryClient, fetchAccountsAndFolders]);
}
