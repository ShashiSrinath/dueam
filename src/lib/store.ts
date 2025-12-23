import { create } from 'zustand';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Account = {
  id?: number;
  type: "google";
  data: {
    email: string;
    name?: string;
    picture?: string;
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
  subject: string | null;
  sender_name: string | null;
  sender_address: string;
  date: string;
  flags: string;
  snippet: string | null;
  has_attachments: boolean;
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

interface EmailState {
  // Accounts & Folders
  accounts: Account[];
  accountFolders: Record<number, Folder[]>;
  fetchAccountsAndFolders: () => Promise<void>;

  // Emails List
  emails: Email[];
  loadingEmails: boolean;
  lastSearchParams: { accountId?: number; folderId?: number; filter?: string } | null;
  fetchEmails: (params: { accountId?: number; folderId?: number; filter?: string }) => Promise<void>;
  refreshEmails: () => Promise<void>;

  // Selected Email
  selectedEmailId: number | null;
  setSelectedEmailId: (id: number | null) => void;

  // Multi-selection
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  toggleSelectAll: () => void;
  clearSelection: () => void;

  // Actions
  markAsRead: (ids: number[]) => Promise<void>;
  
  // Initialization
  init: () => () => void;
  reset: () => void;
}

const initialState: Pick<EmailState, 'accounts' | 'accountFolders' | 'emails' | 'loadingEmails' | 'lastSearchParams' | 'selectedEmailId' | 'selectedIds'> = {
  accounts: [],
  accountFolders: {},
  emails: [],
  loadingEmails: false,
  lastSearchParams: null,
  selectedEmailId: null,
  selectedIds: new Set<number>(),
};

export const useEmailStore = create<EmailState>((set, get) => ({
  ...initialState,

  fetchAccountsAndFolders: async () => {
    try {
      const accounts = (await invoke<Account[]>("get_accounts")) || [];
      set({ accounts });
      
      const foldersMap: Record<number, Folder[]> = {};
      
      // Parallelize folder fetching for all accounts
      await Promise.all(accounts.map(async (account) => {
        if (account.id) {
          const folders = await invoke<Folder[]>("get_folders", { accountId: account.id });
          foldersMap[account.id] = folders;
        }
      }));
      
      set({ accountFolders: foldersMap });
    } catch (error) {
      console.error("Failed to fetch accounts/folders:", error);
    }
  },

  fetchEmails: async (params) => {
    set({ loadingEmails: true, lastSearchParams: params });
    try {
      const emails = await invoke<Email[]>("get_emails", { 
        accountId: params.accountId || null, 
        folderId: params.folderId || null,
        filter: params.filter || null
      });
      set({ emails, selectedIds: new Set() });
    } catch (error) {
      console.error("Failed to fetch emails:", error);
    } finally {
      set({ loadingEmails: false });
    }
  },

  refreshEmails: async () => {
    const { lastSearchParams, fetchEmails } = get();
    if (lastSearchParams) {
      await fetchEmails(lastSearchParams);
    }
  },

  setSelectedEmailId: (id) => {
    if (get().selectedEmailId === id) return;
    set({ selectedEmailId: id });
    if (id) {
      const email = get().emails.find(e => e.id === id);
      if (email && !email.flags.includes("seen")) {
        get().markAsRead([id]);
      }
    }
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

  toggleSelectAll: () => {
    const { emails, selectedIds } = get();
    if (selectedIds.size === emails.length && emails.length > 0) {
      set({ selectedIds: new Set() });
    } else {
      set({ selectedIds: new Set(emails.map((e) => e.id)) });
    }
  },

  clearSelection: () => set({ selectedIds: new Set() }),

  markAsRead: async (ids) => {
    try {
      await invoke("mark_as_read", { emailIds: ids });
      // We don't manually update local state here because we listen for 'emails-updated'
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  },

  init: () => {
    get().fetchAccountsAndFolders();
    
    const unlistenPromise = listen("emails-updated", () => {
      get().fetchAccountsAndFolders();
      get().refreshEmails();
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
    };
  },

  reset: () => set(initialState)
}));