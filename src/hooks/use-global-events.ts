import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useEmailStore } from "@/lib/store";

type EmailEvent =
  | { type: "email-updated"; payload: { id: number; summary?: string | null; flags?: string | null } }
  | { type: "emails-updated-bulk"; payload: { ids: number[]; flags?: string | null } }
  | { type: "email-removed"; payload: { id: number } }
  | { type: "emails-removed-bulk"; payload: { ids: number[] } };

export function useGlobalEvents() {
  const queryClient = useQueryClient();
  const fetchAccountsAndFolders = useEmailStore(s => s.fetchAccountsAndFolders);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const unlistenEmails = listen("emails-updated", (event) => {
      const payload = event.payload as EmailEvent | string | number | null;

      // Debounce the invalidation to avoid rapid refetches during bulk operations
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        // Invalidate all email related queries
        queryClient.invalidateQueries({ queryKey: ["emails"] });
        queryClient.invalidateQueries({ queryKey: ["thread"] });

        const needsFolderRefresh =
          !payload ||
          typeof payload === "string" ||
          typeof payload === "number" ||
          payload.type !== "email-updated" ||
          Boolean(payload.payload.flags);

        if (needsFolderRefresh) {
          fetchAccountsAndFolders();
        }
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
