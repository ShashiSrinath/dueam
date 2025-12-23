import { createFileRoute } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { Gmail } from "@/components/ui/svgs/gmail.tsx";
import { AccountTypeCard } from "@/routes/accounts/-components/account-type-card.tsx";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

export const Route = createFileRoute("/accounts/new-account")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    const unlistenAdded = listen("google-account-added", (event) => {
      console.log("Google account added:", event.payload);
      // TODO: Save to local state/database and redirect
    });

    const unlistenError = listen("google-account-error", (event) => {
      console.error("Google account error:", event.payload);
    });

    return () => {
      unlistenAdded.then((f) => f());
      unlistenError.then((f) => f());
    };
  }, []);

  const handleGoogleLogin = async () => {
    try {
      await invoke("login_with_google");
    } catch (error) {
      console.error("Failed to login with Google:", error);
    }
  };

  return (
    <div className="container max-w-lg mx-auto py-12">
      <div className="space-y-2 mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Add a New Account</h1>
        <p className="text-muted-foreground">
          Choose the type of email account you would like to add.
        </p>
      </div>

      <div className="space-y-4">
        <AccountTypeCard
          title="Google Account"
          description="Sign in with your existing Google account."
          icon={Gmail}
          onClick={handleGoogleLogin}
        />

        {/* Future account types: Microsoft, Custom SMTP, etc. */}
        {/*
        <AccountOption
          title="Microsoft 365 / Outlook"
          description="Connect your Microsoft or Outlook account."
          icon={Mail}
        />
        <AccountOption
          title="Other (IMAP/SMTP)"
          description="Set up a custom account with server details."
          icon={Settings}
        />
        */}
      </div>

      <Separator className="my-8" />

      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          By continuing, you agree to our{" "}
          <a href="#" className="text-primary hover:underline">
            Terms of Service
          </a>
          .
        </p>
      </div>
    </div>
  );
}
