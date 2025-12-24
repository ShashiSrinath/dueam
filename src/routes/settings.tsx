import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEmailStore } from "@/lib/store";
import { useSettingsStore } from "@/lib/settings-store";
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
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trash2, Plus, ArrowLeft } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Separator } from "@/components/ui/separator";

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
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
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
                  {/* Switch component would go here */}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Theme</CardTitle>
                <CardDescription>
                  Choose how Dream Email looks on your device.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { id: "light", label: "Light" },
                    { id: "dark", label: "Dark" },
                    { id: "system", label: "System" },
                    { id: "nord", label: "Nord" },
                    { id: "rose-pine", label: "Rosé Pine" },
                    { id: "dracula", label: "Dracula" },
                  ].map((t) => (
                    <Button
                      key={t.id}
                      variant={settings.theme === t.id ? "default" : "outline"}
                      className="h-20 flex flex-col gap-2"
                      onClick={() => updateSetting("theme", t.id as any)}
                    >
                      <span className="text-sm">{t.label}</span>
                    </Button>
                  ))}
                </div>

                <Separator />

                <div className="space-y-4">
                  <Label>Accent Color</Label>
                  <div className="flex gap-2">
                    {[
                      { id: "blue", color: "bg-blue-500" },
                      { id: "purple", color: "bg-purple-500" },
                      { id: "green", color: "bg-green-500" },
                      { id: "orange", color: "bg-orange-500" },
                      { id: "pink", color: "bg-pink-500" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        className={`w-8 h-8 rounded-full ${c.color} ring-offset-background transition-all ${
                          settings.accentColor === c.id
                            ? "ring-2 ring-ring ring-offset-2"
                            : ""
                        }`}
                        onClick={() => updateSetting("accentColor", c.id)}
                      />
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>UI Density</Label>
                    <Select
                      value={settings.density}
                      onValueChange={(v) =>
                        updateSetting("density", v as any)
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compact">Compact</SelectItem>
                        <SelectItem value="comfortable">Comfortable</SelectItem>
                        <SelectItem value="spacious">Spacious</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Font Family</Label>
                    <Select
                      value={settings.fontFamily}
                      onValueChange={(v) => updateSetting("fontFamily", v)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Inter">Inter</SelectItem>
                        <SelectItem value="system-ui">System UI</SelectItem>
                        <SelectItem value="Roboto">Roboto</SelectItem>
                        <SelectItem value="JetBrains Mono">
                          JetBrains Mono
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Font Size ({settings.fontSize}px)</Label>
                    <div className="w-[200px]">
                      <Slider
                        value={[settings.fontSize]}
                        min={12}
                        max={20}
                        step={1}
                        onValueChange={([v]) => updateSetting("fontSize", v)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
        </Tabs>
      </div>
    </div>
  );
}
