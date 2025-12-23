import "../test/setup";
import { render, within, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { InboxLayout } from "./_inbox";
import { mockInvoke, mockListen } from "../test/setup";
import { useEmailStore } from "@/lib/store";
import { useNavigate, useParams } from "@tanstack/react-router";

// Mock TanStack Virtual
mock.module("@tanstack/react-virtual", () => ({
  useVirtualizer: mock(({ count }: { count: number }) => ({
    getTotalSize: () => count * 100,
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({
      index: i,
      start: i * 100,
      size: 100,
      key: i,
    })),
    measureElement: mock(() => {}),
  })),
}));

const mockEmails = [
  {
    id: 1,
    account_id: 1,
    folder_id: 1,
    remote_id: "1",
    message_id: "m1",
    subject: "Test Email 1",
    sender_name: "Sender 1",
    sender_address: "sender1@example.com",
    date: new Date().toISOString(),
    flags: "[]",
    snippet: "Snippet 1",
    has_attachments: false,
  },
  {
    id: 2,
    account_id: 1,
    folder_id: 1,
    remote_id: "2",
    message_id: "m2",
    subject: "Test Email 2",
    sender_name: "Sender 2",
    sender_address: "sender2@example.com",
    date: new Date().toISOString(),
    flags: "[]",
    snippet: "Snippet 2",
    has_attachments: true,
  },
];

describe("InboxLayout", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockListen.mockClear();
    mockInvoke.mockImplementation((command) => {
      if (command === "get_emails") return Promise.resolve(mockEmails);
      return Promise.resolve();
    });
    
    // Clear mocks for router hooks
    (useNavigate as any).mockClear();
    (useParams as any).mockClear();
    (useParams as any).mockReturnValue({});
  });

  it("renders email list", async () => {
    render(<InboxLayout />);
    const screen = within(document.body);

    await waitFor(() => {
      expect(screen.getByText("Test Email 1")).toBeInTheDocument();
    }, { timeout: 5000 });

    expect(screen.getByText("Test Email 2")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // Badge count
  });

  it("handles multi-select logic", async () => {
    render(<InboxLayout />);
    const screen = within(document.body);

    await waitFor(() => screen.getByText("Test Email 1"));

    const checkboxes = screen.getAllByRole("checkbox");
    const selectAll = checkboxes[0];
    const email1Checkbox = checkboxes[1];

    fireEvent.click(email1Checkbox);
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(screen.queryByText("selected")).toBeNull();
  });

  it("navigates to email when selected", async () => {
    const mockNavigate = mock(() => {});
    (useNavigate as any).mockReturnValue(mockNavigate);

    render(<InboxLayout />);
    const screen = within(document.body);

    await waitFor(() => screen.getByText("Test Email 1"));

    fireEvent.click(screen.getByText("Test Email 1"));

    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({
      to: "/email/$emailId",
      params: { emailId: "1" }
    }));
  });

  it("refreshes email list on emails-updated event", async () => {
    useEmailStore.getState().init();
    render(<InboxLayout />);
    const screen = within(document.body);

    await waitFor(() => screen.getByText("Test Email 1"));

    // Get the callback passed to listen
    const calls = (mockListen.mock as any).calls;
    const listenCall = calls.find((call: any[]) => call[0] === "emails-updated");
    expect(listenCall).toBeDefined();
    const callback = listenCall[1];

    // Trigger the callback
    await act(async () => {
      callback();
    });

    await waitFor(() => {
      // Check that get_emails was called at least twice (initial + refresh)
      const getEmailCalls = mockInvoke.mock.calls.filter(call => call[0] === "get_emails");
      expect(getEmailCalls.length).toBe(2);
      expect(screen.getAllByText("Test Email 1").length).toBeGreaterThan(0);
    });
  });
});

