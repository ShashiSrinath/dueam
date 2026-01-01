import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { Gmail } from "@/components/ui/svgs/gmail.tsx";
import { AccountTypeCard } from "@/routes/accounts/-components/account-type-card.tsx";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { ChevronLeft, Info, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useEmailStore } from "@/lib/store";

export const Route = createFileRoute("/accounts/new")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const unlistenAdded = listen("google-account-added", async (event) => {
      console.log("Google account added:", event.payload);
      await useEmailStore.getState().fetchAccountsAndFolders();
      setIsConnecting(false);
      navigate({ to: "/" });
    });

    const unlistenError = listen("google-account-error", (event) => {
      console.error("Google account error:", event.payload);
      setError(event.payload as string);
      setIsConnecting(false);
    });

    return () => {
      unlistenAdded.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, [navigate]);

  const handleGoogleLogin = async () => {
    try {
      setError(null);
      setIsConnecting(true);
      await invoke("login_with_google");
    } catch (error) {
      console.error("Failed to login with Google:", error);
      setError("Failed to initiate Google login. Please try again.");
      setIsConnecting(false);
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
          <Link to="/">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to Settings
          </Link>
        </Button>

        <div className="space-y-2 mb-12">
          <h1 className="text-4xl font-extrabold tracking-tight">
            Add Account
          </h1>
          <p className="text-xl text-muted-foreground">
            Connect your email provider to sync your messages.
          </p>
        </div>

        {error && (
          <Alert
            variant="destructive"
            className="mb-8 animate-in fade-in slide-in-from-top-4"
          >
            <Info className="h-4 w-4" />
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Email Providers
              </span>
            </div>
          </div>

          <AccountTypeCard
            title="Google / Gmail"
            description="Connect your personal or workspace Google account."
            icon={Gmail}
            onClick={handleGoogleLogin}
            disabled={isConnecting}
          />

          <AccountTypeCard
            title="Other (IMAP)"
            description="Custom server settings."
            icon={Lock}
            onClick={() => navigate({ to: "/accounts/new-imap" })}
            disabled={isConnecting}
          />

          <div className="relative mt-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Coming Soon
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-50 grayscale pointer-events-none">
            <AccountTypeCard
              title="Microsoft 365"
              description="Outlook, Hotmail, Live."
              icon={Mail}
              onClick={() => {}}
            />
          </div>
        </div>

        <Separator className="my-12" />

        <div className="bg-muted/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-background rounded-lg shadow-sm">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Your data is secure</p>
            <p className="text-sm text-muted-foreground text-center">
              Dueam uses industry-standard OAuth2 for Google accounts.
            </p>
            </div>
          </div>
        </div>
      </div>

      <footer className="py-8 border-t bg-muted/10">
        <div className="container max-w-2xl mx-auto px-6 text-center">
          <p className="text-sm text-muted-foreground">
            By continuing, you agree to our{" "}
            <a href="#" className="text-primary font-medium hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-primary font-medium hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
