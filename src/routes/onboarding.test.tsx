import "../test/setup";
import { describe, it, expect, beforeEach } from "bun:test";
import { render, within, fireEvent, waitFor } from "@testing-library/react";
import { OnboardingComponent } from "./onboarding";
import { mockNavigate } from "../test/setup";
import { useEmailStore } from "@/lib/store";

describe("OnboardingComponent", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    // Ensure accounts are empty
    useEmailStore.setState({ accounts: [] });
  });

  it("renders welcome step initially", () => {
    render(<OnboardingComponent />);
    const screen = within(document.body);
    expect(screen.getByText("Welcome to Dream Email")).toBeInTheDocument();
    expect(screen.getByText("Unified Inbox")).toBeInTheDocument();
  });

  it("navigates through steps", async () => {
    render(<OnboardingComponent />);
    const screen = within(document.body);

    // Step 0: Welcome
    expect(screen.getByText("Welcome to Dream Email")).toBeInTheDocument();
    const nextButton = screen.getByText("Next");
    fireEvent.click(nextButton);

    // Step 1: Appearance
    await waitFor(() => {
      expect(screen.getByText("Make it yours")).toBeInTheDocument();
    });
    // Check for theme settings elements
    expect(screen.getByText("Theme")).toBeInTheDocument();

    fireEvent.click(nextButton);

    // Step 2: AI Intelligence
    await waitFor(() => {
      expect(screen.getByText("Supercharge with AI")).toBeInTheDocument();
    });
    // Check for AI settings elements
    expect(screen.getByText("AI Configuration")).toBeInTheDocument();

    fireEvent.click(nextButton);

    // Step 3: Connect
    await waitFor(() => {
      expect(screen.getByText("Let's get connected")).toBeInTheDocument();
    });
    
    // Check for "Add Account" button (which replaces "Next")
    const addAccountButton = screen.getByText("Add Account");
    expect(addAccountButton).toBeInTheDocument();
    
    fireEvent.click(addAccountButton);
    
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/accounts/new" });
  });

  it("redirects if accounts exist", () => {
    useEmailStore.setState({ 
        accounts: [{ 
            id: 1, 
            type: "google", 
            data: { email: "test@example.com", name: "Test" } 
        }] 
    });
    
    render(<OnboardingComponent />);
    
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });
});
