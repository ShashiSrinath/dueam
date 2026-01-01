import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ChevronLeft, Info, Loader2, Mail, Server, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { invoke } from "@tauri-apps/api/core";
import { useEmailStore } from "@/lib/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const imapFormSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(1, "Password is required"),
  imap_host: z.string().min(1, "IMAP host is required"),
  imap_port: z.coerce.number().int().positive(),
  imap_encryption: z.enum(["tls", "starttls", "none"]),
  smtp_host: z.string().min(1, "SMTP host is required"),
  smtp_port: z.coerce.number().int().positive(),
  smtp_encryption: z.enum(["tls", "starttls", "none"]),
});

type ImapFormValues = z.infer<typeof imapFormSchema>;

export const Route = createFileRoute("/accounts/new-imap")({
  component: NewImapComponent,
});

function NewImapComponent() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ImapFormValues>({
    resolver: zodResolver(imapFormSchema) as any,
    defaultValues: {
      email: "",
      name: "",
      password: "",
      imap_host: "",
      imap_port: 993,
      imap_encryption: "tls",
      smtp_host: "",
      smtp_port: 587,
      smtp_encryption: "starttls",
    },
  });

  const onSubmit = async (values: ImapFormValues) => {
    try {
      setError(null);
      setIsSubmitting(true);
      await invoke("add_imap_smtp_account", { account: values });
      await useEmailStore.getState().fetchAccountsAndFolders();
      navigate({ to: "/" });
    } catch (err: any) {
      console.error("Failed to add IMAP account:", err);
      setError(err.toString() || "Failed to connect to the mail server. Please check your settings.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container max-w-2xl mx-auto py-12 px-6 flex-1">
        <Button
          variant="ghost"
          asChild
          className="mb-8 -ml-4 text-muted-foreground hover:text-foreground"
        >
          <Link to="/accounts/new">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to Providers
          </Link>
        </Button>

        <div className="space-y-2 mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight">
            IMAP / SMTP
          </h1>
          <p className="text-xl text-muted-foreground">
            Configure your custom email server settings.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-8">
            <Info className="h-4 w-4" />
            <AlertTitle>Connection Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" /> Account Details
                </CardTitle>
                <CardDescription>
                  Your basic account information and login credentials.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address</FormLabel>
                        <FormControl>
                          <Input placeholder="john@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Server className="h-4 w-4 text-primary" /> Incoming (IMAP)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="imap_host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IMAP Host</FormLabel>
                        <FormControl>
                          <Input placeholder="imap.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="imap_port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Port</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="imap_encryption"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Security</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Encryption" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="tls">SSL / TLS</SelectItem>
                              <SelectItem value="starttls">STARTTLS</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Server className="h-4 w-4 text-primary" /> Outgoing (SMTP)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="smtp_host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SMTP Host</FormLabel>
                        <FormControl>
                          <Input placeholder="smtp.example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="smtp_port"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Port</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="smtp_encryption"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Security</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Encryption" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="tls">SSL / TLS</SelectItem>
                              <SelectItem value="starttls">STARTTLS</SelectItem>
                              <SelectItem value="none">None</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={isSubmitting} className="min-w-[150px]">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting...
                  </>
                ) : (
                  <>
                    Connect Account <ShieldCheck className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
