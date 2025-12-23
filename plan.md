# Dream Email - Development Plan

Dream Email is a modern, high-performance desktop email client built with Tauri, Rust, and React. The core philosophy is to provide a seamless, unified experience for users managing multiple email accounts.

## Core Objective
Act as a desktop email client with **multiple inboxes in the same view** (Unified Inbox) support.

---

## Phase 1: Authentication & Account Foundation (Current)
*   [ ] **Complete Google OAuth Flow**: Finalize the Rust-side OAuth2 handshake and token exchange.
*   [ ] **Secure Storage**: Implement secure storage for Refresh Tokens (using `keyring` or Tauri's encrypted store).
*   [ ] **Multi-Account Manager**: Create a backend registry to manage multiple configured accounts (IMAP/SMTP/OAuth).
*   [ ] **Account Management UI**: Allow users to add, edit, and remove multiple Google/IMAP accounts.

## Phase 2: Data Architecture & Sync
*   [ ] **Local Database (SQLite)**: Set up a local cache using SQLite to ensure the UI remains snappy even with thousands of emails.
*   [ ] **Sync Engine**:
    *   Implement background IMAP fetching using `email-lib`.
    *   IDLE support for real-time push notifications/updates.
    *   Incremental sync to minimize bandwidth.
*   [ ] **Unified Schema**: Design a database schema that indexes emails from different providers into a single searchable table.

## Phase 3: The Unified Inbox UI
*   [ ] **Sidebar Navigation**:
    *   "Unified Inbox" (All accounts).
    *   Individual account folders.
    *   Smart Folders (Unread, Flagged, etc.).
*   [ ] **Message List View**:
    *   Virtual scrolling for high performance.
    *   Multi-select actions.
    *   Account indicators (visual cues for which inbox an email belongs to).
*   [ ] **Email Detail View**:
    *   Sanitized HTML rendering.
    *   Attachment handling.

## Phase 4: Sending & Composition
*   [ ] **SMTP Integration**: Implement outgoing mail logic for different providers.
*   [ ] **Rich Text Editor**: A modern editor with support for formatting, signatures, and attachments.
*   [ ] **Drafts Management**: Local autosave and cross-provider draft syncing.

## Phase 5: Search & Performance
*   [ ] **Full-Text Search**: Leverage SQLite FTS5 for lightning-fast searching across all inboxes.
*   [ ] **Asset Optimization**: Lazy loading for images and attachments.
*   [ ] **Deep System Integration**: Native notifications, keyboard shortcuts, and tray icons.

---

## Tech Stack
- **Frontend**: React 19, TanStack Router, Tailwind CSS 4, Radix UI.
- **Backend**: Rust, Tauri 2.
- **Email Protocol**: `email-lib`, `imap-client` (Rust).
- **Database**: SQLite.
