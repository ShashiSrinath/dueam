# Dream Email - Development Plan

Dream Email is a modern, high-performance desktop email client built with Tauri, Rust, and React. The core philosophy is to provide a seamless, unified experience for users managing multiple email accounts.

## Core Objective

Act as a desktop email client with **multiple inboxes in the same view** (Unified Inbox) support.

---

## Phase 1: Authentication & Account Foundation (Complete)

- [x] **Complete Google OAuth Flow**: Finalize the Rust-side OAuth2 handshake and token exchange.
- [x] **Secure Storage**: Implement secure storage for Refresh Tokens (using `keyring` and Tauri's Stronghold).
- [x] **Multi-Account Manager**: Create a backend registry to manage multiple configured accounts (IMAP/SMTP/OAuth).
- [x] **Account Management UI**: Allow users to add, edit, and remove multiple Google/IMAP accounts.

## Phase 2: Data Architecture & Sync (Complete)

- [x] **Local Database (SQLite)**: Set up a local cache using SQLite to ensure the UI remains snappy even with thousands of emails.
- [x] **Sync Engine**:
  - [x] Implement background IMAP fetching using `email-lib`.
  - [x] IDLE support for real-time push notifications/updates.
  - [x] Incremental sync to minimize bandwidth.
- [x] **Unified Schema**: Design a database schema that indexes emails from different providers into a single searchable table.

## Phase 3: The Unified Inbox UI (Complete)

- [x] **Sidebar Navigation**:
  - [x] "Unified Inbox" (All accounts).
  - [x] Individual account folders (fetched dynamically).
  - [x] Smart Folders (Unread, Flagged, etc.).
- [x] **Message List View**:
  - [x] Virtual scrolling for high performance.
  - [x] Multi-select actions (Delete, Archive, Mark as Read).
  - [x] Account indicators (visual cues for which inbox an email belongs to).
  - [x] Unread status indicators (Blue dot, bold text).
- [x] **Email Detail View**:
  - [x] Sanitized HTML rendering.
  - [x] Attachment handling.
  - [x] Automatic "Mark as Read" on selection.

## Phase 4: Sending & Composition

- [x] **SMTP Integration**: Implement outgoing mail logic for different providers.
- [x] **Rich Text Editor**: A modern editor with support for formatting, signatures, and attachments.
- [x] **Drafts Management**: Local autosave and cross-provider draft syncing.

## Phase 5: Search & Performance (Complete)

- [x] **Full-Text Search**: Leverage SQLite FTS5 for lightning-fast searching across all inboxes.
- [x] **Asset Optimization**: Lazy loading for images and attachments.
- [x] **Deep System Integration**: Native notifications, keyboard shortcuts, and tray icons.
- [x] **Bug Fixes**: Resolved SQLite syntax error in unified counts and improved IMAP error handling.

## Phase 6: Settings & Personalization (Complete)

- [x] **Settings UI**:
  - [x] Create a dedicated Settings page accessible via the sidebar.
  - [x] Move "Add Account" and account management from the sidebar to the Settings UI.
  - [x] Implement a tabbed interface for different settings categories (Accounts, Appearance, General).
- [x] **Advanced Theming & Appearance**:
  - [x] Multi-theme support: Go beyond light/dark with predefined color schemes (e.g., Nord, Rose Pine, Dracula).
  - [x] Custom Accent Colors: Allow users to choose their primary brand color.
  - [x] UI Density: Options for "Compact", "Comfortable", and "Spacious" layouts.
  - [x] Font Customization: Selection of UI fonts and font sizes.
  - [x] Support system theme synchronization.
  - [x] Ensure theme persistence across app restarts.
- [x] **Persistence**:
  - [x] Create a robust mechanism for saving user preferences.
  - [x] Store all settings and preferences in the existing SQLite database to ensure centralized, reliable persistence.

---

## Tech Stack

- **Frontend**: React 19, TanStack Router, Tailwind CSS 4, Radix UI.
- **Backend**: Rust, Tauri 2.
- **Email Protocol**: `email-lib`, `imap-client` (Rust).
- **Database**: SQLite.
