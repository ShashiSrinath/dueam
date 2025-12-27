import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Attachment, useEmailStore } from "@/lib/store";
import {
  Code,
  Paperclip,
  X,
  File,
} from "lucide-react";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

import { MenuBar } from "./menu-bar";
import { ComposerHeader } from "./composer-header";
import { ComposerFooter } from "./composer-footer";
import { RecipientFields } from "./recipient-fields";

export const emailSchema = z.object({
  accountId: z.number().min(1, "Select an account"),
  to: z.string().min(1, "Recipient is required"),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string(),
  body: z.string(),
});

export type EmailFormValues = z.infer<typeof emailSchema>;

interface EmailComposerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultTo?: string;
  defaultCc?: string;
  defaultBcc?: string;
  defaultSubject?: string;
  defaultBody?: string;
  defaultAttachments?: Attachment[];
  draftId?: number;
}

export function EmailComposer({
  open,
  onOpenChange,
  defaultTo = '',
  defaultCc = '',
  defaultBcc = '',
  defaultSubject = '',
  defaultBody = '',
  defaultAttachments = [],
  draftId: initialDraftId
}: EmailComposerProps) {
  const accounts = useEmailStore(state => state.accounts);
  const [isSending, setIsSending] = useState(false);
  const [draftId, setDraftId] = useState<number | undefined>(initialDraftId);
  const [isSaved, setIsSaved] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isCodeView, setIsCodeView] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>(defaultAttachments);
  const lastSavedRef = useRef<string>("");
  const isInitializedRef = useRef<string | null>(null);

  const { register, handleSubmit, control, setValue, reset, formState: { errors } } = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      accountId: accounts[0]?.data.id || 0,
      to: defaultTo,
      cc: defaultCc,
      bcc: defaultBcc,
      subject: defaultSubject,
      body: defaultBody,
    }
  });

  const extensions = useMemo(() => [
    StarterKit.configure({
      bulletList: {
        keepMarks: true,
        keepAttributes: false,
      },
      orderedList: {
        keepMarks: true,
        keepAttributes: false,
      },
    }),
    Underline,
    TextStyle,
    Color,
    Placeholder.configure({
      placeholder: 'Write your message here...',
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-primary underline cursor-pointer',
      },
    }),
  ], []);

  const onUpdate = useCallback(({ editor }: { editor: any }) => {
    setValue("body", editor.getHTML(), { shouldDirty: true });
  }, [setValue]);

  const editor = useEditor({
    extensions,
    content: defaultBody,
    onUpdate,
    editorProps: {
      attributes: {
        class: 'prose-email email-paper focus:outline-none max-w-none px-7 py-6 min-h-full font-sans selection:bg-primary/20',
      },
    },
  });

  // Load draft or reset on open
  useEffect(() => {
    if (open) {
      const initKey = `${initialDraftId || 'new'}-${open}`;
      if (isInitializedRef.current === initKey && editor) return;

      const initComposer = async () => {
        if (initialDraftId) {
          try {
            const draft = await invoke<any>("get_draft_by_id", { id: initialDraftId });
            reset({
              accountId: draft.account_id,
              to: draft.to_address || '',
              cc: draft.cc_address || '',
              bcc: draft.bcc_address || '',
              subject: draft.subject || '',
              body: draft.body_html || '',
            });
            if (editor) {
                editor.commands.setContent(draft.body_html || '');
            }
            setDraftId(initialDraftId);
            setIsSaved(true);
            setAttachments(draft.attachments || []);
            setShowCc(!!draft.cc_address);
            setShowBcc(!!draft.bcc_address);
            lastSavedRef.current = JSON.stringify({
              accountId: draft.account_id,
              to: draft.to_address || '',
              cc: draft.cc_address || '',
              bcc: draft.bcc_address || '',
              subject: draft.subject || '',
              body: draft.body_html || '',
              attachmentIds: (draft.attachments || []).map((a: any) => a.id)
            });
            isInitializedRef.current = initKey;
          } catch (e) {
            console.error("Failed to fetch draft:", e);
          }
        } else {
          reset({
            accountId: accounts[0]?.data.id || 0,
            to: defaultTo,
            cc: defaultCc,
            bcc: defaultBcc,
            subject: defaultSubject,
            body: defaultBody,
          });
          if (editor) {
              editor.commands.setContent(defaultBody);
          }
          setDraftId(undefined);
          setIsSaved(false);
          setAttachments(defaultAttachments);
          setShowCc(!!defaultCc);
          setShowBcc(!!defaultBcc);
          lastSavedRef.current = "";
          isInitializedRef.current = initKey;
        }
      };
      initComposer();
    } else {
        isInitializedRef.current = null;
    }
  }, [open, initialDraftId, defaultTo, defaultCc, defaultBcc, defaultSubject, defaultBody, defaultAttachments, reset, editor, accounts]);

  // Watch for changes to trigger autosave
  const formData = useWatch({ control });

  // Sync editor content if body changes from outside (like code view)
  useEffect(() => {
      if (isCodeView) return;
      const currentEditorHtml = editor?.getHTML();
      if (formData.body !== currentEditorHtml && formData.body !== undefined) {
          editor?.commands.setContent(formData.body, { emitUpdate: false });
      }
  }, [formData.body, editor, isCodeView]);

  useEffect(() => {
    if (!open || !formData || !formData.accountId) return;

    const currentDataString = JSON.stringify({ ...formData, attachmentIds: attachments.map(a => a.id) });
    if (currentDataString === lastSavedRef.current) return;

    // Data changed, reset saved status
    setIsSaved(false);

    const timer = setTimeout(async () => {
      if (!formData.to && !formData.subject && (formData.body === '<p></p>' || !formData.body) && attachments.length === 0) return;

      try {
        const id = await invoke<number>("save_draft", {
          id: draftId || null,
          accountId: formData.accountId,
          to: formData.to || null,
          cc: formData.cc || null,
          bcc: formData.bcc || null,
          subject: formData.subject || null,
          bodyHtml: formData.body || null,
          attachmentIds: attachments.map(a => a.id)
        });
        if (!draftId) setDraftId(id);
        setIsSaved(true);
        lastSavedRef.current = currentDataString;
      } catch (error) {
        console.error("Failed to autosave draft:", error);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [formData, attachments, draftId, open]);

  const onSend = async (data: EmailFormValues) => {
    setIsSending(true);
    try {
      await invoke("send_email", {
        accountId: data.accountId,
        to: data.to,
        cc: data.cc || null,
        bcc: data.bcc || null,
        subject: data.subject,
        body: data.body,
        attachmentIds: attachments.map(a => a.id)
      });

      if (draftId) {
        await invoke("delete_draft", { id: draftId });
      }

      toast.success("Email sent");
      onOpenChange?.(false);
    } catch (error) {
      console.error("Failed to send email:", error);
      toast.error(`Failed to send email: ${error}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleDiscard = async () => {
    if (draftId) {
      try {
        await invoke("delete_draft", { id: draftId });
      } catch (error) {
        console.error("Failed to delete draft:", error);
      }
    }
    onOpenChange?.(false);
  };

  const handleRemoveAttachment = (id: number) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleClose = () => {
    onOpenChange?.(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
            "flex flex-col p-0 gap-0 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border-none shadow-2xl",
            isMaximized ? "max-w-none w-screen h-screen rounded-none" : "sm:max-w-[950px] h-[850px] rounded-[24px]"
        )}
      >
        <ComposerHeader
          subject={formData.subject || ""}
          isSaved={isSaved}
          isMaximized={isMaximized}
          setIsMaximized={setIsMaximized}
          onClose={handleClose}
        />

        <form onSubmit={handleSubmit(onSend)} className="flex flex-col flex-1 min-h-0 bg-background">
          <RecipientFields
            register={register}
            control={control}
            errors={errors}
            accounts={accounts}
            showCc={showCc}
            setShowCc={setShowCc}
            showBcc={showBcc}
            setShowBcc={setShowBcc}
            setValue={setValue}
          />

          <div className="flex-1 flex flex-col min-h-0 bg-background overflow-hidden relative">
            <MenuBar editor={editor} isCodeView={isCodeView} setIsCodeView={setIsCodeView} />

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
              {isCodeView ? (
                <div className="px-7 py-8 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary">
                          <Code className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold uppercase tracking-[0.1em] text-foreground/80 block">HTML Source</span>
                          <span className="text-[10px] text-muted-foreground font-medium">Directly edit raw email code</span>
                        </div>
                      </div>
                  </div>
                  <Textarea
                    {...register("body")}
                    className="flex-1 font-mono text-[13px] p-8 bg-muted/20 border-border/40 rounded-2xl focus-visible:ring-primary/20 min-h-[400px] resize-none leading-relaxed shadow-inner"
                    spellCheck={false}
                  />
                </div>
              ) : (
                <div
                  className="px-0 h-full cursor-text"
                  onClick={() => editor?.commands.focus()}
                >
                  <Controller
                    name="body"
                    control={control}
                    render={() => (
                      <div className="min-h-full flex flex-col">
                        <EditorContent editor={editor} className="flex-1" />

                        {attachments.length > 0 && (
                          <div className="px-7 py-6 border-t bg-muted">
                            <div className="flex items-center gap-2 mb-4 text-muted-foreground select-none">
                              <Paperclip className="w-3.5 h-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">{attachments.length} Attachments</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {attachments.map((att) => (
                                <div
                                  key={att.id}
                                  className="group flex items-center gap-2 px-3 py-1.5 bg-background border rounded-full hover:border-primary/50 transition-all"
                                >
                                  <File className="w-3.5 h-3.5 text-primary/60" />
                                  <span className="text-xs font-medium truncate max-w-[150px]">{att.filename || "Unnamed"}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveAttachment(att.id)}
                                    className="p-0.5 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  />
                </div>
              )}
            </div>
          </div>

          <ComposerFooter
            isSending={isSending}
            onDiscard={handleDiscard}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
