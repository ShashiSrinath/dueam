import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Inbox,
  Settings,
  PenLine,
  Send,
  ShieldAlert,
  FilePen,
} from "lucide-react";
// @ts-ignore
import DueamIcon from "@/assets/dueam-icon.svg?react"
import { Link, useSearch } from "@tanstack/react-router";
import { useEmailStore } from "@/lib/store";
import { EmailComposer } from "./email-composer/email-composer";

export function AppSidebar() {
  // Granular selectors to avoid re-rendering the whole sidebar on every store change
  const primaryCount = useEmailStore((state) => state.unifiedCounts.primary);
  const spamCount = useEmailStore((state) => state.unifiedCounts.spam);
  const composerOpen = useEmailStore((state) => state.composer.open);
  const composerData = useEmailStore((state) => state.composer); // We need this for the composer props
  const setComposer = useEmailStore((state) => state.setComposer);

  const search = useSearch({ strict: false }) as any;

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="p-4 border-b border-sidebar-border h-16 justify-center">
        <div className="flex items-center gap-2 font-bold text-xl">
          <div className=" text-primary-foreground p-1 rounded-lg">
            <DueamIcon className="text-primary w-12 h-12" />
          </div>
          <span>Dueam</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-4 py-4">
          <button
            onClick={() =>
              setComposer({
                open: true,
                draftId: undefined,
                defaultTo: "",
                defaultCc: "",
                defaultBcc: "",
                defaultSubject: "",
                defaultBody: "",
              })
            }
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 py-2.5 rounded-xl font-semibold shadow-sm transition-all active:scale-[0.98]"
          >
            <PenLine className="w-4 h-4" />
            Compose
          </button>
        </div>

        <EmailComposer
          open={composerOpen}
          onOpenChange={(open) => setComposer({ open })}
          draftId={composerData.draftId}
          defaultTo={composerData.defaultTo}
          defaultCc={composerData.defaultCc}
          defaultBcc={composerData.defaultBcc}
          defaultSubject={composerData.defaultSubject}
          defaultBody={composerData.defaultBody}
          defaultAttachments={composerData.defaultAttachments}
        />

        <SidebarGroup>
          <SidebarGroupLabel>Mailboxes</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={
                    (!search.view || search.view === "primary") &&
                    !search.filter
                  }
                >
                  <Link
                    to="/"
                    search={{
                      account_id: search.account_id,
                      view: "primary",
                      filter: undefined,
                    }}
                    className="w-full flex items-center"
                  >
                    <Inbox className="w-4 h-4" />
                    <span>Inbox</span>
                    {primaryCount > 0 && (
                      <span className="ml-auto text-[10px] bg-primary text-primary-foreground px-1.5 rounded-full font-bold">
                        {primaryCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={search.view === "sent"}>
                  <Link
                    to="/"
                    search={{
                      account_id: search.account_id,
                      view: "sent",
                      filter: undefined,
                    }}
                  >
                    <Send className="w-4 h-4" />
                    <span>Sent</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={search.view === "drafts"}>
                  <Link
                    to="/"
                    search={{
                      account_id: search.account_id,
                      view: "drafts",
                      filter: undefined,
                    }}
                  >
                    <FilePen className="w-4 h-4" />
                    <span>Drafts</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={search.view === "spam"}>
                  <Link
                    to="/"
                    search={{
                      account_id: search.account_id,
                      view: "spam",
                      filter: undefined,
                    }}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Spam</span>
                    {spamCount > 0 && (
                      <span className="ml-auto text-[10px] text-destructive font-bold">
                        {spamCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/settings" search={{ tab: "general" }}>
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}