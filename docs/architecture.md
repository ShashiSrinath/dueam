# Dueam Architecture

Dueam is built on a hybrid architecture that prioritizes local data ownership and high-performance UI interactions.

## Core Components

### 1. Frontend (React + TanStack)
- **Framework**: React 19 for a modern, reactive UI.
- **Routing**: TanStack Router handles complex nested layouts (Sidebar -> Inbox -> Email View).
- **State Management**: 
    - **Zustand**: Manages global application state (accounts, folders, unified counts).
    - **TanStack Query**: Handles asynchronous data fetching from the Rust backend with built-in caching and background refetching.

### 2. Backend (Rust + Tauri v2)
- **Tauri**: Provides a secure bridge between the web frontend and the system.
- **Email Engines**: Uses `email-lib` and a custom `imap-client` for robust IMAP/SMTP interactions.
- **Background Sync**: A dedicated sync engine manages periodic fetching of new mail and background indexing.

### 3. Data Layer (SQLite)
- **Persistence**: All metadata, snippets, and settings are stored in a local SQLite database.
- **FTS5**: Full-Text Search is handled by SQLite's FTS5 engine, enabling sub-millisecond search across thousands of emails.
- **Privacy**: No email data ever leaves your machine unless you are explicitly communicating with your email provider or an optional LLM provider for enrichment.

### 4. Intelligence Layer (AI)
- **Summarization**: Integration with Gemma 3 models (via `langchain-rust`) to provide concise thread summaries.
- **Enrichment**: A dedicated worker that enriches sender profiles with professional and social data.

## Data Flow

1. **Sync**: Rust Sync Engine -> IMAP Server -> Local SQLite.
2. **Notification**: Rust -> Tauri Event -> React Frontend.
3. **Display**: React -> TanStack Query -> Tauri Command -> SQLite -> UI.
4. **Action**: UI -> Tauri Command -> Rust (SMTP/IMAP Action) -> Provider.

## Development Principles

- **Local First**: Every piece of data should be searchable and accessible offline once synced.
- **Type Safety**: End-to-end type safety from Rust structs to TypeScript types via Tauri's command system.
- **Minimal Latency**: UI interactions (searching, switching folders) should be instantaneous by hitting the local cache/DB first.
