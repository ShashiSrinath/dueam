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
import { Button } from "@/components/ui/button";
import { Bot, RefreshCw, Eye, EyeOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const aiSettingsSchema = z.object({
  aiEnabled: z.boolean(),
  aiBaseUrl: z.string(),
  aiApiKey: z.string(),
  aiModel: z.string(),
  aiSenderEnrichmentEnabled: z.boolean(),
  aiSummarizationEnabled: z.boolean(),
});

type AiSettingsValues = z.infer<typeof aiSettingsSchema>;

export function AiSettings() {
  const aiEnabled = useSettingsStore((state) => state.settings.aiEnabled);
  const aiBaseUrl = useSettingsStore((state) => state.settings.aiBaseUrl);
  const aiApiKey = useSettingsStore((state) => state.settings.aiApiKey);
  const aiModel = useSettingsStore((state) => state.settings.aiModel);
  const aiSenderEnrichmentEnabled = useSettingsStore((state) => state.settings.aiSenderEnrichmentEnabled);
  const aiSummarizationEnabled = useSettingsStore((state) => state.settings.aiSummarizationEnabled);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  
  const [showApiKey, setShowApiKey] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ id: string }[]>([]);

  const form = useForm<AiSettingsValues>({
    resolver: zodResolver(aiSettingsSchema),
    defaultValues: {
      aiEnabled,
      aiBaseUrl,
      aiApiKey,
      aiModel,
      aiSenderEnrichmentEnabled,
      aiSummarizationEnabled,
    },
  });

  useEffect(() => {
    if (!form.formState.isDirty) {
      form.reset({
        aiEnabled,
        aiBaseUrl,
        aiApiKey,
        aiModel,
        aiSenderEnrichmentEnabled,
        aiSummarizationEnabled,
      });
    }
  }, [aiEnabled, aiBaseUrl, aiApiKey, aiModel, aiSenderEnrichmentEnabled, aiSummarizationEnabled, form]);

  const onFieldBlur = async (name: keyof AiSettingsValues) => {
    const value = form.getValues(name);
    const currentStoreValue = useSettingsStore.getState().settings[name];
    if (value !== currentStoreValue) {
      await updateSetting(name, value);
    }
  };

  const handleFetchModels = async () => {
    const baseUrl = form.getValues("aiBaseUrl");
    const apiKey = form.getValues("aiApiKey");

    if (!baseUrl) {
      toast.error("Please enter a Base URL first");
      return;
    }

    setFetchingModels(true);
    try {
      const models = await invoke<{ id: string }[]>("get_available_models", {
        baseUrl,
        apiKey,
      });
      setAvailableModels(models);
      toast.success(`Successfully fetched ${models.length} models`);
    } catch (error) {
      console.error("Failed to fetch models:", error);
      toast.error(typeof error === "string" ? error : "Failed to fetch models");
    } finally {
      setFetchingModels(false);
    }
  };

  return (
    <div className="space-y-6">
      <Form {...form}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" /> AI Configuration
                </CardTitle>
                <CardDescription>
                  Configure your AI provider and model for email enrichment and smart features.
                </CardDescription>
              </div>
              <FormField
                control={form.control}
                name="aiEnabled"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          updateSetting("aiEnabled", checked);
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="aiBaseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Base URL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://api.openai.com/v1"
                        onBlur={() => onFieldBlur("aiBaseUrl")}
                      />
                    </FormControl>
                    <FormDescription>
                      The API endpoint for your AI provider (e.g., OpenAI, Anthropic, or local Ollama).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="aiApiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showApiKey ? "text" : "password"}
                          placeholder="sk-..."
                          onBlur={() => onFieldBlur("aiApiKey")}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="aiModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            field.onChange(v);
                            updateSetting("aiModel", v);
                          }}
                          disabled={!form.watch("aiBaseUrl")}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select a model" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableModels.length > 0 ? (
                              availableModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.id}
                                </SelectItem>
                              ))
                            ) : field.value ? (
                              <SelectItem value={field.value}>{field.value}</SelectItem>
                            ) : (
                              <div className="p-2 text-sm text-center text-muted-foreground">
                                No models loaded. Click fetch to see available models.
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleFetchModels}
                        disabled={fetchingModels || !form.watch("aiBaseUrl")}
                      >
                        <RefreshCw className={`h-4 w-4 ${fetchingModels ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {form.watch("aiEnabled") && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>AI Features</CardTitle>
              <CardDescription>
                Select which AI-powered features you want to enable.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="aiSenderEnrichmentEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between space-y-0">
                    <div className="space-y-0.5">
                      <FormLabel>Sender Data Enrichment</FormLabel>
                      <FormDescription>
                        Automatically discover professional info, bios, and company data for senders.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          updateSetting("aiSenderEnrichmentEnabled", checked);
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
                          <Separator />
                          <FormField
                            control={form.control}
                            name="aiSummarizationEnabled"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between space-y-0">
                                <div className="space-y-0.5">
                                  <FormLabel>Email Summarization</FormLabel>
                                  <FormDescription>
                                    Automatically summarize long email threads.
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={(checked) => {
                                      field.onChange(checked);
                                      updateSetting("aiSummarizationEnabled", checked);
                                    }}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <Separator />              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Smart Replies</Label>
                  <p className="text-sm text-muted-foreground">
                    Generate context-aware reply suggestions.
                  </p>
                </div>
                <Switch disabled />
              </div>
            </CardContent>
          </Card>
        )}
      </Form>
    </div>
  );
}
