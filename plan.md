# Plan: Add IMAP/SMTP and Microsoft Account Support

This plan outlines the steps to add support for generic IMAP/SMTP accounts and Microsoft (Outlook/Office 365) accounts to the email client.

## Phase 1: Backend Infrastructure

### 1.1 Data Models
- [ ] Create `src-tauri/src/email_backend/accounts/imap_smtp.rs`:
    - Define `ImapSmtpAccount` struct: `id`, `email`, `name`, `imap_host`, `imap_port`, `imap_encryption`, `smtp_host`, `smtp_port`, `smtp_encryption`, `password`.
- [ ] Create `src-tauri/src/email_backend/accounts/microsoft.rs`:
    - Define `MicrosoftAccount` struct (similar to `GoogleAccount`).
    - Define `MicrosoftOAuth2Config` for handling Microsoft-specific OAuth flow (URLs, scopes).
- [ ] Update `Account` enum in `src-tauri/src/email_backend/accounts/manager.rs`:
    - Add `ImapSmtp(ImapSmtpAccount)` and `Microsoft(MicrosoftAccount)` variants.

### 1.2 Account Manager Updates
- [ ] Update `Account` methods in `manager.rs`:
    - `email()`, `id()`, `set_id()`, `account_type()`, `strip_secrets()`: Add support for new variants.
    - `get_configs()`: Implement mapping for `ImapSmtp` and `Microsoft` to `email-lib` configurations.
- [ ] Update `AccountManager::refresh_access_token`:
    - Add logic for Microsoft OAuth token refresh.
- [ ] Update `AccountManager::add_account`:
    - Update SQL query to handle name/picture for new account types.
- [ ] Update `AccountManager::load`:
    - Update DB fetching to correctly populate new account fields.

### 1.3 Tauri Commands
- [ ] In `src-tauri/src/email_backend/accounts/commands.rs`:
    - Add `login_with_microsoft` command.
    - Add `add_imap_smtp_account` command.

## Phase 2: Frontend UI

### 2.1 Onboarding & Account Selection
- [ ] Update `src/routes/accounts/new.tsx`:
    - Enable "Microsoft 365" and "Other (IMAP)" cards.
    - Wire up "Microsoft 365" to `login_with_microsoft`.
    - Wire up "Other (IMAP)" to navigate to a new configuration form.

### 2.2 IMAP/SMTP Configuration Form
- [ ] Create `src/routes/accounts/new-imap.tsx` (or similar):
    - Build a form for all IMAP and SMTP server details.
    - Add "Connect" button that invokes `add_imap_smtp_account`.
    - Handle loading states and connection errors.

### 2.3 Microsoft OAuth Integration
- [ ] Handle `microsoft-account-added` and `microsoft-account-error` events in the frontend (similar to Google).

## Phase 3: Integration & Sync

### 3.1 Sync Engine
- [ ] Verify `SyncEngine` correctly triggers for the new account types. Since it uses `Account` enum and `get_configs()`, it should work if Phase 1 is done correctly.

### 3.2 Error Handling
- [ ] Improve error reporting for connection failures in the UI.

## Phase 4: Verification

### 4.1 Automated Testing
- [ ] Add unit tests in `manager.rs` for new account variants.
- [ ] Test `get_configs()` output for various IMAP/SMTP configurations.

### 4.2 Manual Testing
- [ ] Test adding a Microsoft account (Hotmail/Outlook).
- [ ] Test adding an IMAP/SMTP account (e.g., iCloud, Fastmail, or a private server).
- [ ] Verify that emails are fetched and can be sent for all account types.
