import { Controller, UseFormRegister, Control, FieldErrors, UseFormSetValue } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmailFormValues } from "./email-composer";

interface RecipientFieldsProps {
  register: UseFormRegister<EmailFormValues>;
  control: Control<EmailFormValues>;
  errors: FieldErrors<EmailFormValues>;
  accounts: any[];
  showCc: boolean;
  setShowCc: (val: boolean) => void;
  showBcc: boolean;
  setShowBcc: (val: boolean) => void;
  setValue: UseFormSetValue<EmailFormValues>;
}

export function RecipientFields({
  register,
  control,
  errors,
  accounts,
  showCc,
  setShowCc,
  showBcc,
  setShowBcc,
  setValue
}: RecipientFieldsProps) {
  return (
    <div className="flex flex-col border-b divide-y divide-border/40 shrink-0">
      {/* From */}
      <div className="flex items-center px-6 py-1.5 gap-4 group transition-colors hover:bg-muted/30">
        <Label className="w-16 text-[11px] font-semibold uppercase tracking-wider text-foreground/40">From</Label>
        <Controller
          name="accountId"
          control={control}
          render={({ field }) => (
            <Select
              onValueChange={(val) => field.onChange(parseInt(val))}
              value={field.value.toString()}
            >
              <SelectTrigger className="border-none shadow-none focus:ring-0 h-10 px-3 pr-20 -ml-3 text-[14px] font-medium hover:bg-muted/50 bg-transparent transition-all rounded-xl w-full">
                <div className="flex items-center gap-2 text-left">
                  {accounts.find(a => a.data.id === field.value)?.data.name && (
                    <span className="font-semibold text-foreground/90">
                      {accounts.find(a => a.data.id === field.value)?.data.name}
                    </span>
                  )}
                  <span className={cn(
                    "text-muted-foreground font-normal",
                    accounts.find(a => a.data.id === field.value)?.data.name ? "text-xs opacity-60" : "text-[14px]"
                  )}>
                    &lt;{accounts.find(a => a.data.id === field.value)?.data.email}&gt;
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl border border-border/40 shadow-2xl p-1.5 min-w-[320px]">
                {accounts.map(account => (
                  <SelectItem key={account.data.id} value={account.data.id!.toString()} className="rounded-xl py-3 px-3 focus:bg-primary/5 focus:text-primary transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0 overflow-hidden">
                          {account.data.picture ? (
                            <img src={account.data.picture} className="w-full h-full object-cover" alt="" />
                          ) : (
                            account.data.email[0].toUpperCase()
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="font-bold text-[14px] tracking-tight truncate">{account.data.name || 'No Name'}</span>
                            <span className="text-xs text-muted-foreground/70 truncate">{account.data.email}</span>
                        </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      {/* To */}
      <div className="flex items-center px-6 py-1.5 gap-4 relative group transition-colors hover:bg-muted/30">
        <Label htmlFor="to" className="w-16 text-[11px] font-semibold uppercase tracking-wider text-foreground/40">To</Label>
        <Input
          id="to"
          {...register("to")}
          autoFocus
          className="flex-1 border-none shadow-none focus-visible:ring-0 px-3 pr-20 -ml-3 h-10 text-[14px] font-medium placeholder:text-muted-foreground/30 transition-all bg-transparent"
          placeholder="recipient@example.com"
        />
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {!showCc && (
            <button
              type="button"
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-primary/5"
              onClick={() => setShowCc(true)}
            >
              Cc
            </button>
          )}
          {!showBcc && (
            <button
              type="button"
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 hover:text-primary transition-colors px-2 py-1.5 rounded-md hover:bg-primary/5"
              onClick={() => setShowBcc(true)}
            >
              Bcc
            </button>
          )}
        </div>
        {errors.to && <span className="absolute bottom-0.5 left-[120px] text-[9px] text-destructive font-bold uppercase tracking-tighter">{errors.to.message}</span>}
      </div>

      {/* Cc */}
      {showCc && (
        <div className="flex items-center px-6 py-1.5 gap-4 group animate-in fade-in slide-in-from-top-1 duration-200 transition-colors hover:bg-muted/30 relative">
          <Label htmlFor="cc" className="w-16 text-[11px] font-semibold uppercase tracking-wider text-foreground/40">Cc</Label>
          <Input
            id="cc"
            {...register("cc")}
            className="flex-1 border-none shadow-none focus-visible:ring-0 px-3 pr-20 -ml-3 h-10 text-[14px] font-medium placeholder:text-muted-foreground/30 bg-transparent"
            placeholder="carbon-copy@example.com"
          />
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive rounded-full transition-all"
                onClick={() => {
                    setValue("cc", "");
                    setShowCc(false);
                }}
            >
                <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Bcc */}
      {showBcc && (
        <div className="flex items-center px-6 py-1.5 gap-4 group animate-in fade-in slide-in-from-top-1 duration-200 transition-colors hover:bg-muted/30 relative">
          <Label htmlFor="bcc" className="w-16 text-[11px] font-semibold uppercase tracking-wider text-foreground/40">Bcc</Label>
          <Input
            id="bcc"
            {...register("bcc")}
            className="flex-1 border-none shadow-none focus-visible:ring-0 px-3 pr-20 -ml-3 h-10 text-[14px] font-medium placeholder:text-muted-foreground/30 bg-transparent"
            placeholder="blind-carbon-copy@example.com"
          />
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive rounded-full transition-all"
                onClick={() => {
                    setValue("bcc", "");
                    setShowBcc(false);
                }}
            >
                <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Subject */}
      <div className="flex items-center px-6 py-1.5 gap-4 group transition-colors hover:bg-muted/30 relative">
        <Label htmlFor="subject" className="w-16 text-[11px] font-semibold uppercase tracking-wider text-foreground/40">Subject</Label>
        <Input
          id="subject"
          {...register("subject")}
          className="flex-1 border-none shadow-none focus-visible:ring-0 px-3 pr-20 -ml-3 h-10 text-[15px] font-bold placeholder:text-muted-foreground/20 tracking-tight bg-transparent"
          placeholder="What's this about?"
        />
      </div>
    </div>
  );
}
