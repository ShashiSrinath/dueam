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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from "@/components/ui/sidebar";
import { CircleAlert, Inbox, Mail, Plus, Settings, Star } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { Gmail } from "@/components/ui/svgs/gmail";
import { useEmailStore } from "@/lib/store";

export function AppSidebar() {
  const accounts = useEmailStore(state => state.accounts)
  const accountFolders = useEmailStore(state => state.accountFolders)
  const init = useEmailStore(state => state.init)
  const search = useSearch({ from: '/_inbox' })

  useEffect(() => {
    return init();
  }, [init])

  const totalUnread = useMemo(() => {
    return Object.values(accountFolders).flat().reduce((acc, folder) => acc + folder.unread_count, 0)
  }, [accountFolders])

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b h-16 justify-center">
        <div className="flex items-center gap-2 font-bold text-xl">
          <div className="bg-primary text-primary-foreground p-1 rounded-lg">
            <Mail className="w-6 h-6" />
          </div>
          <span>Dream Email</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={!search.accountId && !search.folderId && !search.filter}>
                   <Link to="/" search={{ accountId: undefined, folderId: undefined, filter: undefined }} className="w-full flex items-center">
                    <Inbox className="w-4 h-4" />
                    <span>Unified Inbox</span>
                    {totalUnread > 0 && (
                        <span className="ml-auto text-[10px] bg-primary text-primary-foreground px-1.5 rounded-full font-bold">
                            {totalUnread}
                        </span>
                    )}
                   </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Smart Folders</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={search.filter === "unread"}>
                  <Link to="/" search={{ accountId: undefined, folderId: undefined, filter: "unread" }} className="w-full flex items-center">
                    <CircleAlert className="w-4 h-4" />
                    <span>Unread</span>
                    {totalUnread > 0 && (
                        <span className="ml-auto text-[10px] font-bold text-primary">
                            {totalUnread}
                        </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={search.filter === "flagged"}>
                  <Link to="/" search={{ accountId: undefined, folderId: undefined, filter: "flagged" }}>
                    <Star className="w-4 h-4" />
                    <span>Flagged</span>
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
              {accounts.map((account) => (
                <SidebarMenuItem key={account.data.email}>
                  <SidebarMenuButton
                    asChild
                    tooltip={account.data.email}
                    isActive={search.accountId === account.id && !search.folderId && !search.filter}
                  >
                    <Link to="/" search={{ accountId: account.id, folderId: undefined, filter: undefined }}>
                        {account.type === 'google' ? <Gmail className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                        <span>{account.data.name || account.data.email}</span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {account.id && accountFolders[account.id]?.map((folder) => (
                        <SidebarMenuSubItem key={folder.id}>
                            <SidebarMenuSubButton asChild isActive={search.folderId === folder.id}>
                                <Link to="/" search={{ accountId: account.id, folderId: folder.id, filter: undefined }}>
                                    <span className="truncate">{folder.name}</span>
                                    {folder.unread_count > 0 && (
                                        <span className="ml-auto text-[10px] bg-primary text-primary-foreground px-1.5 rounded-full">
                                            {folder.unread_count}
                                        </span>
                                    )}
                                </Link>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/accounts/new-account">
                    <Plus className="w-4 h-4" />
                    <span>Add Account</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
         <SidebarMenu>
            <SidebarMenuItem>
                <SidebarMenuButton asChild>
                    <Link to="/">
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
         </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
