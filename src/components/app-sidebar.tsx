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
  Mail,
  Settings,
  PenLine,
  Send,
  ShieldAlert,
  LayoutGrid,
} from "lucide-react";
import { Link, useSearch } from "@tanstack/react-router";
import { Gmail } from "@/components/ui/svgs/gmail";
import { useEmailStore } from "@/lib/store";
import { EmailComposer } from "./email-composer/email-composer";

export function AppSidebar() {
  const accounts = useEmailStore((state) => state.accounts);
  const unifiedCounts = useEmailStore((state) => state.unifiedCounts);
  const search = useSearch({ strict: false }) as any;
  const composer = useEmailStore((state) => state.composer);
  const setComposer = useEmailStore((state) => state.setComposer);

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="p-4 border-b border-sidebar-border h-16 justify-center">
        <div className="flex items-center gap-2 font-bold text-xl">
          <div className="bg-primary text-primary-foreground p-1 rounded-lg">
            <Mail className="w-6 h-6" />
          </div>
          <span>Dream Email</span>
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
          open={composer.open}
          onOpenChange={(open) => setComposer({ open })}
          draftId={composer.draftId}
          defaultTo={composer.defaultTo}
          defaultCc={composer.defaultCc}
          defaultBcc={composer.defaultBcc}
          defaultSubject={composer.defaultSubject}
          defaultBody={composer.defaultBody}
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
                    {unifiedCounts.primary > 0 && (
                      <span className="ml-auto text-[10px] bg-primary text-primary-foreground px-1.5 rounded-full font-bold">
                        {unifiedCounts.primary}
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
                    {unifiedCounts.spam > 0 && (
                      <span className="ml-auto text-[10px] text-destructive font-bold">
                        {unifiedCounts.spam}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Accounts</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={!search.account_id}>
                  <Link to="/" search={{ ...search, account_id: undefined }}>
                    <LayoutGrid className="w-4 h-4" />
                    <span>All Accounts</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {accounts.map((account) => (
                <SidebarMenuItem key={account.data.email}>
                  <SidebarMenuButton
                    asChild
                    tooltip={account.data.email}
                    isActive={search.account_id === account.data.id}
                  >
                    <Link
                      to="/"
                      search={{ ...search, account_id: account.data.id }}
                    >
                      {account.type === "google" ? (
                        <Gmail className="w-4 h-4" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      <span>{account.data.name || account.data.email}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
