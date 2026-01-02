import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEmailStore } from "@/lib/store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trash2, Plus, ArrowLeft } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { AiSettings } from "@/components/settings/ai-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/lib/settings-store";
import { SyncSettings } from "@/components/settings/sync-settings";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tab: (search.tab as string) || "general",
    };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = useSearch({ from: "/settings" });
  const navigate = useNavigate();
  const { accounts, fetchAccountsAndFolders } = useEmailStore();
  const { settings, updateSetting } = useSettingsStore();

  const handleRemoveAccount = async (index: number) => {
    try {
      await invoke("remove_account", { index });
      await fetchAccountsAndFolders();
    } catch (error) {
      console.error("Failed to remove account:", error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex items-center gap-4 p-4 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate({ to: "/" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({ to: "/settings", search: { tab: v } })
          }
          className="max-w-4xl mx-auto"
        >
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Language & Region</CardTitle>
                <CardDescription>
                  Configure your display language and regional preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="language">Display Language</Label>
                  <Select defaultValue="en">
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notifications</CardTitle>
                <CardDescription>
                  Manage how you receive notifications.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Desktop Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Show notifications for new emails.
                    </p>
                  </div>
                  <Switch
                    checked={settings.notificationsEnabled}
                    onCheckedChange={(checked) =>
                      updateSetting("notificationsEnabled", checked)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <SyncSettings />
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6">
            <ThemeSettings />
          </TabsContent>

          <TabsContent value="accounts" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Connected Accounts</h3>
                <p className="text-sm text-muted-foreground">
                  Manage your email accounts and their settings.
                </p>
              </div>
              <Button onClick={() => navigate({ to: "/accounts/new" })}>
                <Plus className="mr-2 h-4 w-4" /> Add Account
              </Button>
            </div>

            <div className="space-y-4">
              {accounts.map((account, index) => (
                <Card key={account.data.email}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={account.data.picture} />
                        <AvatarFallback>
                          {account.data.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {account.data.name || account.data.email}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {account.data.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleRemoveAccount(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-6">
            <AiSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}