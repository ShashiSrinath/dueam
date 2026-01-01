import { useInfiniteQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Email } from "@/lib/store";

export type EmailSearchParams = {
  account_id?: number;
  view?: string;
  filter?: string;
  search?: string;
};

const PAGE_SIZE = 50;

export function useEmails(params: EmailSearchParams) {
  return useInfiniteQuery({
    queryKey: ["emails", params],
    queryFn: async ({ pageParam }: { pageParam: { date: string, id: number } | null }) => {
      if (params.search) {
        return await invoke<Email[]>("search_emails", {
          queryText: params.search,
          accountId: params.account_id || null,
          view: params.view || null,
          limit: PAGE_SIZE,
          before_date: pageParam?.date || null,
          before_id: pageParam?.id || null,
        });
      }

      return await invoke<Email[]>("get_emails", {
        account_id: params.account_id || null,
        view: params.view || "primary",
        filter: params.filter || null,
        limit: PAGE_SIZE,
        before_date: pageParam?.date || null,
        before_id: pageParam?.id || null,
      });
    },
    initialPageParam: null as { date: string, id: number } | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      const lastEmail = lastPage[lastPage.length - 1];
      return { date: lastEmail.date, id: lastEmail.id };
    },
  });
}