import { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useEmailStore } from "@/lib/store";
import {
  Code,
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
  const lastSavedRef = useRef<string>("");

  const { register, handleSubmit, control, watch, setValue, reset, formState: { errors } } = useForm<EmailFormValues>({
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

  const editor = useEditor({
    extensions: [
      StarterKit,
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
    ],
    content: defaultBody,
    onUpdate: ({ editor }) => {
      setValue("body", editor.getHTML(), { shouldDirty: true });
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base focus:outline-none max-w-none px-12 py-10 min-h-[450px] font-sans selection:bg-primary/20',
      },
    },
  });

  // Load draft or reset on open
  useEffect(() => {
    if (open) {
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
            editor?.commands.setContent(draft.body_html || '');
            setDraftId(initialDraftId);
            setIsSaved(true);
            if (draft.cc_address) setShowCc(true);
            if (draft.bcc_address) setShowBcc(true);
            lastSavedRef.current = JSON.stringify({
              accountId: draft.account_id,
              to: draft.to_address || '',
              cc: draft.cc_address || '',
              bcc: draft.bcc_address || '',
              subject: draft.subject || '',
              body: draft.body_html || '',
            });
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
          editor?.commands.setContent(defaultBody);
          setDraftId(undefined);
          setIsSaved(false);
          setShowCc(!!defaultCc);
          setShowBcc(!!defaultBcc);
          lastSavedRef.current = "";
        }
      };
      initComposer();
    }
  }, [open, initialDraftId, defaultTo, defaultCc, defaultBcc, defaultSubject, defaultBody, reset, editor, accounts]);

  // Watch for changes to trigger autosave
  const formData = watch();

  // Sync editor content if body changes from outside (like code view)
  useEffect(() => {
      if (isCodeView) return; 
      const currentEditorHtml = editor?.getHTML();
      if (formData.body !== currentEditorHtml && formData.body !== undefined) {
          editor?.commands.setContent(formData.body, { emitUpdate: false });
      }
  }, [formData.body, editor, isCodeView]);

  useEffect(() => {
    if (!open || !formData.accountId) return;

    const currentDataString = JSON.stringify(formData);
    if (currentDataString === lastSavedRef.current) return;

    const timer = setTimeout(async () => {
      if (!formData.to && !formData.subject && (formData.body === '<p></p>' || !formData.body)) return;

      try {
        const id = await invoke<number>("save_draft", {
          id: draftId || null,
          accountId: formData.accountId,
          to: formData.to || null,
          cc: formData.cc || null,
          bcc: formData.bcc || null,
          subject: formData.subject || null,
          bodyHtml: formData.body || null
        });
        if (!draftId) setDraftId(id);
        setIsSaved(true);
        lastSavedRef.current = currentDataString;
      } catch (error) {
        console.error("Failed to autosave draft:", error);
      }
    }, 2000);

    return () => {
        clearTimeout(timer);
        setIsSaved(false);
    };
  }, [formData, draftId, open]);

  const onSend = async (data: EmailFormValues) => {
    setIsSending(true);
    try {
      await invoke("send_email", {
        accountId: data.accountId,
        to: data.to,
        cc: data.cc || null,
        bcc: data.bcc || null,
        subject: data.subject,
        body: data.body
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
          subject={formData.subject}
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
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {isCodeView ? (
                <div className="p-12 h-full flex flex-col">
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
                <div className="px-0">
                  <Controller
                    name="body"
                    control={control}
                    render={() => <EditorContent editor={editor} />}
                  />
                </div>
              )}
            </div>

            <MenuBar editor={editor} isCodeView={isCodeView} setIsCodeView={setIsCodeView} />
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
