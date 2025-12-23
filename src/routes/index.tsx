import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button.tsx";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Gmail } from "@/components/ui/svgs/gmail.tsx";
import { Trash2, Plus, Mail, Settings2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/")({
  component: App,
});

type Account = {
  type: "google";
  data: {
    email: string;
    name?: string;
    picture?: string;
  };
};

function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = async () => {
    try {
      const data = await invoke<Account[]>("get_accounts");
      setAccounts(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleRemove = async (index: number) => {
    try {
      await invoke("remove_account", { index });
      fetchAccounts();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-8 space-y-8">
        <header className="flex justify-between items-end">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Manage your email accounts and preferences.
            </p>
          </div>
          <Button asChild size="lg" className="rounded-full shadow-lg">
            <Link to="/accounts/new-account">
              <Plus className="mr-2 h-5 w-5" /> Add Account
            </Link>
          </Button>
        </header>

        <Separator />

        <div className="space-y-6">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="h-5 w-5 text-primary" />
            <h2>Connected Accounts</h2>
            <Badge variant="secondary" className="ml-2">
              {accounts.length}
            </Badge>
          </div>

          <div className="grid gap-4">
            {loading ? (
              <div className="h-32 flex items-center justify-center border rounded-xl border-dashed">
                <p className="text-muted-foreground animate-pulse">
                  Loading accounts...
                </p>
              </div>
            ) : accounts.length === 0 ? (
              <Card className="border-dashed shadow-none">
                <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="p-4 bg-muted rounded-full">
                    <Mail className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-lg font-medium">No accounts connected</p>
                    <p className="text-sm text-muted-foreground">
                      Connect your first email account to get started.
                    </p>
                  </div>
                  <Button variant="outline" asChild>
                    <Link to="/accounts/new-account">Connect Account</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              accounts.map((account, i) => (
                <Card
                  key={i}
                  className="group overflow-hidden border-muted hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-md"
                >
                  <CardHeader className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="relative group-hover:scale-110 transition-transform duration-300">
                          {account.data.picture ? (
                            <img
                              src={account.data.picture}
                              alt={account.data.name || account.data.email}
                              className="h-12 w-12 rounded-xl object-cover border shadow-sm"
                            />
                          ) : (
                            <div className="p-3 bg-background border rounded-xl shadow-sm">
                              {account.type === "google" ? (
                                <Gmail className="h-6 w-6" />
                              ) : (
                                <Mail className="h-6 w-6" />
                              )}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5 border shadow-sm">
                            {account.type === "google" && (
                              <Gmail className="h-3 w-3" />
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-xl">
                              {account.data.name || account.data.email}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1"
                            >
                              <ShieldCheck className="h-3 w-3" /> Connected
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground font-medium">
                            {account.data.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Settings2 className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleRemove(i)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Remove Account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </div>
        </div>

        <div className="pt-8">
          <Card className="bg-muted/30 border-none shadow-none">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">Need help?</p>
                <p className="text-sm text-muted-foreground">
                  Check our documentation for setting up custom IMAP/SMTP
                  accounts.
                </p>
              </div>
              <Button variant="link">View Docs</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default App;
