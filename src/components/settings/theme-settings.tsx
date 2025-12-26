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
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function ThemeSettings() {
  const settings = useSettingsStore((state) => state.settings);
  const updateSetting = useSettingsStore((state) => state.updateSetting);

  return (
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
              onValueChange={(v) => updateSetting("density", v as any)}
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
                <SelectItem value="JetBrains Mono">JetBrains Mono</SelectItem>
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
  );
}
