import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sender } from "@/lib/store";

const senderCache = new Map<string, Sender>();
const pendingRequests = new Map<string, Promise<Sender | null>>();

export function useSenderInfo(address: string | undefined) {
  const [sender, setSender] = useState<Sender | null>(
    address ? senderCache.get(address) || null : null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setSender(null);
      return;
    }

    if (senderCache.has(address)) {
      setSender(senderCache.get(address)!);
      return;
    }

    const fetchSender = async () => {
      if (pendingRequests.has(address)) {
        const result = await pendingRequests.get(address);
        setSender(result || null);
        return;
      }

      setLoading(true);
      const promise = invoke<Sender | null>("get_sender_info", { address });
      pendingRequests.set(address, promise);

      try {
        const result = await promise;
        if (result) {
          senderCache.set(address, result);
          setSender(result);
        }
      } catch (error) {
        console.error("Failed to fetch sender info:", error);
      } finally {
        pendingRequests.delete(address);
        setLoading(false);
      }
    };

    fetchSender();
  }, [address]);

  return { sender, loading };
}
