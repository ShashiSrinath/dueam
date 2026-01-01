import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { Sender } from "@/lib/store";

export function useSenderInfo(address: string | undefined, manual: boolean = false) {
  const query = useQuery({
    queryKey: ["sender", address, manual],
    queryFn: async () => {
      if (!address) return null;
      return await invoke<Sender | null>("get_sender_info", { 
        address, 
        manualTrigger: manual 
      });
    },
    enabled: !!address,
    staleTime: manual ? 0 : 1000 * 60 * 60, // 1 hour for regular info
  });

  return { sender: query.data || null, loading: query.isLoading };
}
