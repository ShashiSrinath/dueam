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
    <div className="flex flex-col border-b divide-y divide-border/40 shrink-0 px-1">
      {/* From */}
      <div className="flex items-center px-12 py-2 gap-4 group transition-colors hover:bg-muted/30">
        <Label className="w-16 text-[11px] font-medium uppercase tracking-wider text-foreground/50">From</Label>
        <Controller
          name="accountId"
          control={control}
          render={({ field }) => (
            <Select
              onValueChange={(val) => field.onChange(parseInt(val))}
              value={field.value.toString()}
            >
              <SelectTrigger className="border-none shadow-none focus:ring-0 h-12 px-0 text-[14px] font-medium hover:bg-transparent bg-transparent transition-all">
                <div className="flex items-center gap-2 text-left">
                  {accounts.find(a => a.data.id === field.value)?.data.name && (
                    <span className="font-semibold text-foreground">
                      {accounts.find(a => a.data.id === field.value)?.data.name}
                    </span>
                  )}
                  <span className={cn(
                    "text-muted-foreground font-normal",
                    accounts.find(a => a.data.id === field.value)?.data.name ? "text-xs opacity-70" : "text-[14px]"
                  )}>
                    &lt;{accounts.find(a => a.data.id === field.value)?.data.email}&gt;
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-2xl border border-border/40 shadow-2xl p-1.5 min-w-[300px]">
                {accounts.map(account => (
                  <SelectItem key={account.data.id} value={account.data.id!.toString()} className="rounded-xl py-2.5 px-3 focus:bg-primary/5 focus:text-primary transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {account.data.picture ? (
                            <img src={account.data.picture} className="w-full h-full rounded-full" alt="" />
                          ) : (
                            account.data.email[0].toUpperCase()
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="font-bold text-sm tracking-tight truncate">{account.data.name || 'No Name'}</span>
                            <span className="text-xs text-muted-foreground truncate">{account.data.email}</span>
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
      <div className="flex items-center px-12 py-2 gap-4 relative group transition-colors hover:bg-muted/30">
        <Label htmlFor="to" className="w-16 text-[11px] font-medium uppercase tracking-wider text-foreground/50">To</Label>
        <Input
          id="to"
          {...register("to")}
          autoFocus
          className="flex-1 border-none shadow-none focus-visible:ring-0 px-0 h-12 text-[14px] font-medium placeholder:text-muted-foreground/30 transition-all"
          placeholder="recipient@example.com"
        />
        <div className="flex items-center gap-1 opacity-0 group-focus-within:opacity-100 transition-all duration-300 translate-x-2 group-focus-within:translate-x-0">
          {!showCc && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:bg-primary/5 hover:text-primary rounded-lg transition-all"
              onClick={() => setShowCc(true)}
            >
              Cc
            </Button>
          )}
          {!showBcc && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:bg-primary/5 hover:text-primary rounded-lg transition-all"
              onClick={() => {
                  setShowBcc(true);
              }}
            >
              Bcc
            </Button>
          )}
        </div>
        {errors.to && <span className="absolute bottom-1 left-32 text-[9px] text-destructive font-bold uppercase tracking-tighter">{errors.to.message}</span>}
      </div>

      {/* Cc */}
      {showCc && (
        <div className="flex items-center px-12 py-2 gap-4 group animate-in fade-in slide-in-from-top-1 duration-300 transition-colors hover:bg-muted/30">
          <Label htmlFor="cc" className="w-16 text-[11px] font-medium uppercase tracking-wider text-foreground/50">Cc</Label>
          <Input
            id="cc"
            {...register("cc")}
            className="flex-1 border-none shadow-none focus-visible:ring-0 px-0 h-12 text-[14px] font-medium placeholder:text-muted-foreground/30"
            placeholder="carbon-copy@example.com"
          />
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
      )}

      {/* Bcc */}
      {showBcc && (
        <div className="flex items-center px-12 py-2 gap-4 group animate-in fade-in slide-in-from-top-1 duration-300 transition-colors hover:bg-muted/30">
          <Label htmlFor="bcc" className="w-16 text-[11px] font-medium uppercase tracking-wider text-foreground/50">Bcc</Label>
          <Input
            id="bcc"
            {...register("bcc")}
            className="flex-1 border-none shadow-none focus-visible:ring-0 px-0 h-12 text-[14px] font-medium placeholder:text-muted-foreground/30"
            placeholder="blind-carbon-copy@example.com"
          />
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
      )}

      {/* Subject */}
      <div className="flex items-center px-12 py-2 gap-4 group transition-colors hover:bg-muted/30">
        <Label htmlFor="subject" className="w-16 text-[11px] font-medium uppercase tracking-wider text-foreground/50">Subject</Label>
        <Input
          id="subject"
          {...register("subject")}
          className="flex-1 border-none shadow-none focus-visible:ring-0 px-0 h-12 text-[15px] font-bold placeholder:text-muted-foreground/20 tracking-tight"
          placeholder="What's this about?"
        />
      </div>
    </div>
  );
}
