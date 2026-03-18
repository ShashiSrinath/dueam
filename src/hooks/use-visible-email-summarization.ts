import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/lib/settings-store";

export function useVisibleEmailSummarization(emailIds: number[]) {
  const aiEnabled = useSettingsStore((state) => state.settings.aiEnabled);
  const aiSummarizationEnabled = useSettingsStore(
    (state) => state.settings.aiSummarizationEnabled,
  );
  const triggeredRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!aiEnabled || !aiSummarizationEnabled) return;
    if (emailIds.length === 0) return;

    const newIds = emailIds.filter((id) => !triggeredRef.current.has(id));
    if (newIds.length === 0) return;

    newIds.forEach((id) => triggeredRef.current.add(id));

    if (triggeredRef.current.size > 100) {
      const idsArray = Array.from(triggeredRef.current);
      triggeredRef.current = new Set(idsArray.slice(-50));
    }

    invoke("summarize_visible_emails", { emailIds: newIds }).catch((err) => {
      console.error("Failed to trigger summarization:", err);
    });
  }, [emailIds, aiEnabled, aiSummarizationEnabled]);
}
