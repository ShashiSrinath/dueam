import {
  createRootRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useEmailStore } from "@/lib/store";
import { useSettingsStore } from "@/lib/settings-store";
import { useEffect } from "react";
import { Mail } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import "../styles.css";

const RootLayout = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const accounts = useEmailStore((state) => state.accounts);
  const isInitialized = useEmailStore((state) => state.isInitialized);
  const init = useEmailStore((state) => state.init);
  const settings = useSettingsStore((state) => state.settings);
  const initSettings = useSettingsStore((state) => state.init);

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark", "nord", "rose-pine", "dracula");
    
    if (settings.theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(settings.theme);
    }

    // Apply density
    root.classList.remove("density-compact", "density-comfortable", "density-spacious");
    root.classList.add(`density-${settings.density}`);

    // Apply accent color
    root.classList.remove("accent-blue", "accent-purple", "accent-green", "accent-orange", "accent-pink");
    root.classList.add(`accent-${settings.accentColor}`);

    // Apply font size
    root.style.fontSize = `${settings.fontSize}px`;
    
    // Map font family names to their full CSS font stacks
    const fontMap: Record<string, string> = {
      "Inter": "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      "Roboto": "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      "JetBrains Mono": "'JetBrains Mono', monospace",
      "system-ui": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    };
    root.style.fontFamily = fontMap[settings.fontFamily] || settings.fontFamily;
  }, [settings]);

  const isAuthRoute =
    pathname === "/onboarding" || pathname === "/accounts/new";

  useEffect(() => {
    return init();
  }, [init]);

  useEffect(() => {
    if (!isInitialized) return;

    // If no accounts and not on an auth route, redirect to onboarding
    if (accounts.length === 0 && !isAuthRoute) {
      navigate({ to: "/onboarding" });
    }
  }, [accounts.length, isAuthRoute, navigate, isInitialized]);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center animate-in fade-in duration-500">
        <div className="flex flex-col items-center gap-4">
          <div className="bg-primary text-primary-foreground p-4 rounded-3xl animate-pulse">
            <Mail className="w-12 h-12" />
          </div>
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Dueam</h1>
            <div className="flex gap-1 justify-center">
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
        <Toaster />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
};

export const Route = createRootRoute({ component: RootLayout });
