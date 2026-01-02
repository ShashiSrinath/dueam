import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Account = {
  type: "google" | "microsoft" | "imap_smtp";
  data: {
    id?: number;
    email: string;
    name?: string;
    picture?: string;
    imap_host?: string;
    imap_port?: number;
    imap_encryption?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_encryption?: string;
  };
};

export type Folder = {
  id: number;
  account_id: number;
  name: string;
  path: string;
  role?: string;
  unread_count: number;
};

export type Email = {
  id: number;
  account_id: number;
  folder_id: number;
  remote_id: string;
  message_id: string | null;
  thread_id: string | null;
  thread_count: number | null;
  subject: string | null;
  sender_name: string | null;
  sender_address: string;
  recipient_to: string | null;
  date: string;
  flags: string;
  snippet: string | null;
  summary: string | null;
  has_attachments: boolean;
  is_reply: boolean;
  is_forward: boolean;
};

export type Sender = {
  address: string;
  name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  company: string | null;
  bio: string | null;
  location: string | null;
  github_handle: string | null;
  linkedin_handle: string | null;
  twitter_handle: string | null;
  website_url: string | null;
  is_verified: boolean;
  is_contact: boolean;
  account_email: string | null;
  is_personal_email: boolean | null;
  is_automated_mailer: boolean | null;
  ai_last_enriched_at: string | null;
  last_enriched_at: string | null;
};

export type Domain = {
  domain: string;
  name: string | null;
  logo_url: string | null;
  description: string | null;
  website_url: string | null;
  location: string | null;
  last_enriched_at: string | null;
};

export type EmailContent = {
  body_text: string | null;
  body_html: string | null;
};

export type Attachment = {
  id: number;
  email_id: number;
  filename: string | null;
  mime_type: string | null;
  size: number;
};

interface UnifiedCounts {
  primary: number;
  sent: number;
  spam: number;
  drafts: number;
}

interface EmailState {
  // Initialization
  isInitialized: boolean;
  init: () => () => void;
  reset: () => void;

  // Accounts & Folders
  accounts: Account[];
  accountsMap: Record<number, Account>;
  accountFolders: Record<number, Folder[]>;
  unifiedCounts: UnifiedCounts;
  fetchAccountsAndFolders: () => Promise<void>;
  fetchUnifiedCounts: () => Promise<void>;

  // Selected Email
  selectedEmailId: number | null;
  setSelectedEmailId: (id: number | null) => void;

  // Multi-selection
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  selectRange: (id: number, orderedIds: number[]) => void;
  toggleSelectAll: (ids: number[]) => void;
  clearSelection: () => void;

  // Actions
  markAsRead: (ids: number[]) => Promise<void>;
  moveToTrash: (ids: number[]) => Promise<void>;
  archiveEmails: (ids: number[]) => Promise<void>;
  moveToInbox: (ids: number[]) => Promise<void>;

  // Composer
  composer: {
    open: boolean;
    draftId?: number;
    defaultTo?: string;
    defaultCc?: string;
    defaultBcc?: string;
    defaultSubject?: string;
    defaultBody?: string;
    defaultAttachments?: Attachment[];
  };
  setComposer: (state: Partial<EmailState["composer"]>) => void;
}

const initialState: Pick<
  EmailState,
  | "isInitialized"
  | "accounts"
  | "accountsMap"
  | "accountFolders"
  | "unifiedCounts"
  | "selectedEmailId"
  | "selectedIds"
  | "composer"
> = {
  isInitialized: false,
  accounts: [],
  accountsMap: {},
  accountFolders: {},
  unifiedCounts: { primary: 0, sent: 0, spam: 0, drafts: 0 },
  selectedEmailId: null,
  selectedIds: new Set<number>(),
  composer: {
    open: false,
  },
};

export const useEmailStore = create<EmailState>((set, get) => ({
  ...initialState,

  fetchAccountsAndFolders: async () => {
    try {
      const accounts = (await invoke<Account[]>("get_accounts")) || [];
      const accountsMap: Record<number, Account> = {};
      accounts.forEach(a => {
        if (a.data.id) accountsMap[a.data.id] = a;
      });
      
      const currentAccounts = get().accounts;
      const accountsChanged = accounts.length !== currentAccounts.length || 
        accounts.some((a, i) => a.data.id !== currentAccounts[i]?.data.id || a.data.email !== currentAccounts[i]?.data.email);
      
      if (accountsChanged) {
        set({ accounts, accountsMap });
      }

      const foldersMap: Record<number, Folder[]> = {};
      const currentFoldersMap = get().accountFolders;
      let foldersChanged = false;

      await Promise.all(
        accounts.map(async (account) => {
          if (account.data.id) {
            const folders = await invoke<Folder[]>("get_folders", {
              account_id: account.data.id,
            });
            foldersMap[account.data.id] = folders;
            
            const currentFolders = currentFoldersMap[account.data.id] || [];
            if (folders.length !== currentFolders.length || 
                folders.some((f, i) => f.id !== currentFolders[i]?.id || f.unread_count !== currentFolders[i]?.unread_count)) {
              foldersChanged = true;
            }
          }
        }),
      );

      if (foldersChanged || Object.keys(foldersMap).length !== Object.keys(currentFoldersMap).length) {
        set({ accountFolders: foldersMap });
      }
      
      get().fetchUnifiedCounts();
    } catch (error) {
      console.error("Failed to fetch accounts/folders:", error);
    }
  },

  fetchUnifiedCounts: async () => {
    try {
      const counts = await invoke<any>("get_unified_counts");
      if (!counts) return;
      
      const current = get().unifiedCounts;
      if (current.primary !== (counts.primary || 0) || 
          current.sent !== (counts.sent || 0) || 
          current.spam !== (counts.spam || 0) ||
          current.drafts !== (counts.drafts || 0)) {
        set({
          unifiedCounts: {
            primary: counts.primary || 0,
            sent: counts.sent || 0,
            spam: counts.spam || 0,
            drafts: counts.drafts || 0,
          },
        });
      }
    } catch (error) {
      console.error("Failed to fetch unified counts:", error);
    }
  },

  setSelectedEmailId: (id) => {
    const currentId = get().selectedEmailId;
    if (currentId === id) return;
    set({ selectedEmailId: id });
  },

  toggleSelect: (id) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    });
  },

  selectRange: (id, orderedIds) => {
    const { selectedIds, selectedEmailId } = get();
    if (orderedIds.length === 0) return;

    const currentIndex = orderedIds.indexOf(id);
    if (currentIndex === -1) return;

    let anchorId = selectedEmailId;
    if (selectedIds.size > 0 && !selectedIds.has(anchorId || -1)) {
      const selectedIndices = orderedIds
        .map((id, i) => (selectedIds.has(id) ? i : -1))
        .filter((i) => i !== -1);

      if (selectedIndices.length > 0) {
        const closestIndex = selectedIndices.reduce((prev, curr) =>
          Math.abs(curr - currentIndex) < Math.abs(prev - currentIndex)
            ? curr
            : prev,
        );
        anchorId = orderedIds[closestIndex];
      }
    }

    if (anchorId === null) {
      get().toggleSelect(id);
      return;
    }

    const anchorIndex = orderedIds.indexOf(anchorId);
    if (anchorIndex === -1) {
      get().toggleSelect(id);
      return;
    }

    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);

    set((state) => {
      const next = new Set(state.selectedIds);
      const isSelecting = !next.has(id);

      for (let i = start; i <= end; i++) {
        if (isSelecting) {
          next.add(orderedIds[i]);
        } else {
          next.delete(orderedIds[i]);
        }
      }
      return { selectedIds: next };
    });
  },

  toggleSelectAll: (ids) => {
    const { selectedIds } = get();
    if (selectedIds.size === ids.length && ids.length > 0) {
      set({ selectedIds: new Set() });
    } else {
      set({ selectedIds: new Set(ids) });
    }
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  setComposer: (state) =>
    set((s) => ({ composer: { ...s.composer, ...state } })),

  markAsRead: async (ids) => {
    try {
      await invoke("mark_as_read", { emailIds: ids });
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  },

  moveToTrash: async (ids) => {
    set((state) => ({
      selectedIds: new Set(
        Array.from(state.selectedIds).filter((id) => !ids.includes(id)),
      ),
      selectedEmailId:
        state.selectedEmailId && ids.includes(state.selectedEmailId)
          ? null
          : state.selectedEmailId,
    }));

    try {
      await invoke("move_to_trash", { emailIds: ids });
      get().fetchUnifiedCounts();
      get().fetchAccountsAndFolders();
    } catch (error) {
      console.error("Failed to move to trash:", error);
    }
  },

  archiveEmails: async (ids) => {
    set((state) => ({
      selectedIds: new Set(
        Array.from(state.selectedIds).filter((id) => !ids.includes(id)),
      ),
      selectedEmailId:
        state.selectedEmailId && ids.includes(state.selectedEmailId)
          ? null
          : state.selectedEmailId,
    }));

    try {
      await invoke("archive_emails", { emailIds: ids });
      get().fetchUnifiedCounts();
      get().fetchAccountsAndFolders();
    } catch (error) {
      console.error("Failed to archive emails:", error);
    }
  },

  moveToInbox: async (ids) => {
    set((state) => ({
      selectedIds: new Set(
        Array.from(state.selectedIds).filter((id) => !ids.includes(id)),
      ),
      selectedEmailId:
        state.selectedEmailId && ids.includes(state.selectedEmailId)
          ? null
          : state.selectedEmailId,
    }));

    try {
      await invoke("move_to_inbox", { emailIds: ids });
      get().fetchUnifiedCounts();
      get().fetchAccountsAndFolders();
    } catch (error) {
      console.error("Failed to move to inbox:", error);
    }
  },

  init: () => {
    get()
      .fetchAccountsAndFolders()
      .then(() => {
        set({ isInitialized: true });
      });

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const unlistenPromise = listen("emails-updated", () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        get().fetchAccountsAndFolders();
      }, 500);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      if (timeout) clearTimeout(timeout);
    };
  },

  reset: () => set(initialState),
}));
