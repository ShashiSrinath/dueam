import "../../test/setup";
import { render, within, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "bun:test";
import { Route, ThreadView } from "./email.$emailId";
import { mockInvoke } from "../../test/setup";

const mockEmail = {
  id: 1,
  account_id: 1,
  folder_id: 1,
  remote_id: "1",
  message_id: "m1",
  thread_id: "t1",
  subject: "Test Subject",
  sender_name: "Sender",
  sender_address: "sender@example.com",
  date: new Date().toISOString(),
  flags: "[]",
  snippet: "Snippet",
  has_attachments: false,
};

const mockThreadEmails = [mockEmail];

describe("ThreadView", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it("renders email content and handles null content gracefully", async () => {
    mockInvoke.mockImplementation((command, args) => {
      if (command === "get_email_by_id") return Promise.resolve(mockEmail);
      if (command === "get_thread_emails") return Promise.resolve(mockThreadEmails);
      if (command === "get_email_content") {
          // Simulate null content returning from backend or some error
          return Promise.resolve(null);
      }
      if (command === "get_attachments") return Promise.resolve([]);
      if (command === "get_sender_info") return Promise.resolve(null);
      if (command === "get_domain_info") return Promise.resolve(null);
      if (command === "get_emails_by_sender") return Promise.resolve([]);
      return Promise.resolve();
    });

    // Mock the Route.useLoaderData hook
    const originalUseLoaderData = Route.useLoaderData;
    Route.useLoaderData = () => ({
      email: mockEmail,
      threadEmails: mockThreadEmails,
    }) as any;

    render(<ThreadView />);
    
    const screen = within(document.body);
    expect(screen.getByText("Test Subject")).toBeInTheDocument();
    
    // Wait for content fetch to finish (it will return null)
    await waitFor(() => {
        // After my fix, it should not crash.
        // It should render the sender name/address in the header at least.
        expect(screen.getAllByText("Sender").length).toBeGreaterThan(0);
    });

    // Restore
    Route.useLoaderData = originalUseLoaderData;
  });
});
