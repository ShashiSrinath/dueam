import { useSettingsStore } from "@/lib/settings-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, RefreshCw } from "lucide-react";

export function SyncSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" /> Email Synchronization
        </CardTitle>
        <CardDescription>
          Configure how far back you want to sync your email content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Content Sync Depth</Label>
              <p className="text-sm text-muted-foreground">
                Download full email content for the selected
                period.
              </p>
            </div>
            <Select
              value={settings.syncMonths.toString()}
              onValueChange={(v) => updateSetting("syncMonths", parseInt(v))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last Month</SelectItem>
                <SelectItem value="3">Last 3 Months</SelectItem>
                <SelectItem value="6">Last 6 Months</SelectItem>
                <SelectItem value="12">Last Year</SelectItem>
                <SelectItem value="0">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[13px] text-muted-foreground bg-muted/50 p-3 rounded-md border border-border/50">
            <Info className="h-4 w-4 inline-block mr-2 mb-0.5" />
            Note: Email headers (subject, sender, etc.) will always be synced
            for all emails. Limiting content sync saves disk space but will
            affect full-text search and offline availability for older messages.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
