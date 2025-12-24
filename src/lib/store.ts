import { create } from 'zustand';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type Account = {
  type: "google";
  data: {
    id?: number;
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
  // Initialization
  isInitialized: boolean;
  init: () => () => void;
  reset: () => void;

  // Accounts & Folders
  accounts: Account[];
  accountFolders: Record<number, Folder[]>;
  fetchAccountsAndFolders: () => Promise<void>;

  // Emails List
  emails: Email[];
  loadingEmails: boolean;
  hasMore: boolean;
  lastSearchParams: { accountId?: number; folderId?: number; filter?: string } | null;
  fetchEmails: (params: { accountId?: number; folderId?: number; filter?: string }, isRefresh?: boolean) => Promise<void>;
  fetchMoreEmails: () => Promise<void>;
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

  // Composer
  composer: {
    open: boolean;
    draftId?: number;
    defaultTo?: string;
    defaultSubject?: string;
    defaultBody?: string;
  };
  setComposer: (state: Partial<EmailState['composer']>) => void;
}

const initialState: Pick<EmailState, 'isInitialized' | 'accounts' | 'accountFolders' | 'emails' | 'loadingEmails' | 'hasMore' | 'lastSearchParams' | 'selectedEmailId' | 'selectedIds' | 'composer'> = {
  isInitialized: false,
  accounts: [],
  accountFolders: {},
  emails: [],
  loadingEmails: false,
  hasMore: true,
  lastSearchParams: null,
  selectedEmailId: null,
  selectedIds: new Set<number>(),
  composer: {
    open: false,
  },
};

const PAGE_SIZE = 50;

export const useEmailStore = create<EmailState>((set, get) => ({
  ...initialState,

  fetchAccountsAndFolders: async () => {
    try {
      const accounts = (await invoke<Account[]>("get_accounts")) || [];
      set({ accounts });
      
      const foldersMap: Record<number, Folder[]> = {};
      
      // Parallelize folder fetching for all accounts
      await Promise.all(accounts.map(async (account) => {
        if (account.data.id) {
          const folders = await invoke<Folder[]>("get_folders", { accountId: account.data.id });
          foldersMap[account.data.id] = folders;
        }
      }));
      
      set({ accountFolders: foldersMap });
    } catch (error) {
      console.error("Failed to fetch accounts/folders:", error);
    }
  },

  fetchEmails: async (params, isRefresh = false) => {
    const { emails: currentEmails, loadingEmails } = get();
    if (loadingEmails && !isRefresh) return;

    set({ loadingEmails: true, lastSearchParams: params });
    
    // If refreshing, we want to fetch at least as many as we already have 
    // to avoid the list shrinking and causing scroll jumps
    const limit = isRefresh ? Math.max(currentEmails.length, PAGE_SIZE) : PAGE_SIZE;
    
    if (!isRefresh) {
      set({ emails: [], hasMore: true, selectedIds: new Set() });
    }
    
    try {
      let fetchedEmails: Email[] = [];

      if (params.filter === "drafts") {
        // Fetch from drafts table and map to Email type
        const accounts = get().accounts;
        const drafts: any[] = [];
        
        await Promise.all(accounts.map(async (account) => {
            if (account.data.id) {
                const accountDrafts = await invoke<any[]>("get_drafts", { accountId: account.data.id });
                drafts.push(...accountDrafts);
            }
        }));

        fetchedEmails = drafts.map(d => ({
            id: d.id, // Note: This might conflict with email IDs, but for now it's okay if we are only showing drafts
            account_id: d.account_id,
            folder_id: -1, // Special ID for drafts
            remote_id: `draft-${d.id}`,
            message_id: null,
            subject: d.subject || "(No Subject)",
            sender_name: "Draft",
            sender_address: d.to_address || "(No Recipient)",
            date: d.updated_at,
            flags: JSON.stringify(["draft"]),
            snippet: d.body_html ? d.body_html.replace(/<[^>]*>/g, '').substring(0, 100) : null,
            has_attachments: false
        }));
      } else {
        fetchedEmails = await invoke<Email[]>("get_emails", { 
          account_id: params.accountId || null, 
          folder_id: params.folderId || null,
          filter: params.filter || null,
          limit,
          offset: 0
        });
      }
      
      if (isRefresh) {
        // Smart Merge: Update existing items if they changed, add new ones at the top,
        // but preserve references for unchanged items to help React/Virtualizer.
        set(state => {
          const emailMap = new Map(state.emails.map(e => [e.id, e]));
          let changed = false;
          
          const merged = fetchedEmails.map(newEmail => {
            const existing = emailMap.get(newEmail.id);
            if (existing) {
              // Deep compare important fields (simplified here)
              if (existing.flags !== newEmail.flags || existing.subject !== newEmail.subject) {
                changed = true;
                return newEmail;
              }
              return existing; // Keep reference!
            }
            changed = true;
            return newEmail;
          });

          // Also check if some were removed or if length changed
          if (merged.length !== state.emails.length) changed = true;

          return changed ? { emails: merged, hasMore: fetchedEmails.length === limit } : {};
        });
      } else {
        set({ emails: fetchedEmails, hasMore: fetchedEmails.length === limit });
      }
    } catch (error) {
      console.error("Failed to fetch emails:", error);
    } finally {
      set({ loadingEmails: false });
    }
  },

  fetchMoreEmails: async () => {
    const { emails, loadingEmails, hasMore, lastSearchParams } = get();
    if (loadingEmails || !hasMore || !lastSearchParams) return;

    set({ loadingEmails: true });
    try {
      const newEmails = await invoke<Email[]>("get_emails", {
        account_id: lastSearchParams.accountId || null,
        folder_id: lastSearchParams.folderId || null,
        filter: lastSearchParams.filter || null,
        limit: PAGE_SIZE,
        offset: emails.length
      });

      set(state => {
        const existingIds = new Set(state.emails.map(e => e.id));
        const uniqueNewEmails = newEmails.filter(e => !existingIds.has(e.id));
        return { 
          emails: [...state.emails, ...uniqueNewEmails], 
          hasMore: newEmails.length === PAGE_SIZE 
        };
      });
    } catch (error) {
      console.error("Failed to fetch more emails:", error);
    } finally {
      set({ loadingEmails: false });
    }
  },

  refreshEmails: async () => {
    const { lastSearchParams, fetchEmails } = get();
    if (lastSearchParams) {
      await fetchEmails(lastSearchParams, true);
    }
  },

  setSelectedEmailId: (id) => {
    const currentId = get().selectedEmailId;
    if (currentId === id) return;
    
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

  setComposer: (state) => set((s) => ({ composer: { ...s.composer, ...state } })),

  markAsRead: async (ids) => {
    // 1. Optimistic Update
    set(state => ({
      emails: state.emails.map(email => {
        if (ids.includes(email.id) && !email.flags.includes("seen")) {
          // Parse and update flags
          try {
            const flags = JSON.parse(email.flags) as string[];
            if (!flags.includes("seen")) {
              flags.push("seen");
            }
            return { ...email, flags: JSON.stringify(flags) };
          } catch {
            return { ...email, flags: '["seen"]' };
          }
        }
        return email;
      })
    }));

    try {
      await invoke("mark_as_read", { emailIds: ids });
      // We don't need to refresh the whole list immediately here 
      // since the event listener will handle consistency eventually
      // but the UI is already updated.
    } catch (error) {
      console.error("Failed to mark as read:", error);
      // Revert on error if needed, but for flags, a background sync usually fixes it
    }
  },

  init: () => {
    get().fetchAccountsAndFolders().then(() => {
      set({ isInitialized: true });
    });
    
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