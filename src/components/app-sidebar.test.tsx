import "../test/setup";
import { describe, it, expect, beforeEach } from "bun:test";
import { render, within, waitFor, act } from "@testing-library/react";
import { AppSidebar } from "./app-sidebar";
import { mockInvoke } from "../test/setup";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useEmailStore } from "@/lib/store";

const mockAccounts = [
  {
    id: 1,
    type: "google",
    data: {
      email: "test@gmail.com",
      name: "Test User",
    },
  },
];

const mockFolders = [
  {
    id: 1,
    account_id: 1,
    name: "Inbox",
    path: "INBOX",
    unread_count: 5,
  },
];

describe("AppSidebar", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockInvoke.mockImplementation((command, _args) => {
      if (command === "get_accounts") return Promise.resolve(mockAccounts);
      if (command === "get_folders") return Promise.resolve(mockFolders);
      if (command === "get_unified_counts") return Promise.resolve({
          primary: 5,
          sent: 0,
          spam: 0,
          drafts: 0,
      });
      return Promise.resolve();
    });
  });

  it("renders unified inbox info", async () => {
    await act(async () => {
      await useEmailStore.getState().fetchAccountsAndFolders();
      useEmailStore.setState({ isInitialized: true });
    });

    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    );

    const screen = within(document.body);

    await waitFor(() => {
      expect(screen.getByText("Inbox")).toBeInTheDocument();
      // Use getAllByText and check that at least one '5' is found, or be more specific
      const unreadBadges = screen.getAllByText("5");
      expect(unreadBadges.length).toBeGreaterThan(0);
    });
  });

  it("renders main mailboxes", () => {
    render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    );

    const screen = within(document.body);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Spam")).toBeInTheDocument();
  });
});
