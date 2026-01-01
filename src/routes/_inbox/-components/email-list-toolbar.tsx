import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useEffect } from "react";

interface EmailListToolbarProps {
  isAllSelected: boolean;
  isSomeSelected: boolean;
  onToggleSelectAll: () => void;
  title: string;
  emailCount: number;
  initialSearchValue: string;
  onSearchDebounced: (value: string) => void;
}

export function EmailListToolbar({
  isAllSelected,
  isSomeSelected,
  onToggleSelectAll,
  title,
  emailCount,
  initialSearchValue,
  onSearchDebounced,
}: EmailListToolbarProps) {
  const [localSearch, setLocalSearch] = useState(initialSearchValue);

  // Sync local search when initialSearchValue changes (e.g. on navigation)
  useEffect(() => {
    setLocalSearch(initialSearchValue);
  }, [initialSearchValue]);

  // Handle debouncing locally
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== initialSearchValue) {
        onSearchDebounced(localSearch);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [localSearch, initialSearchValue, onSearchDebounced]);

  return (
    <div className="p-4 border-b bg-background flex flex-col gap-4 shrink-0">
      <div className="flex justify-between items-center h-8">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={isAllSelected || (isSomeSelected ? "indeterminate" : false)}
            onCheckedChange={onToggleSelectAll}
          />
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </div>
        <Badge variant="secondary" className="font-semibold">{emailCount}</Badge>
      </div>
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input
          type="search"
          placeholder="Search emails..."
          className="pl-9 h-10 bg-muted/30 border-none focus-visible:ring-1 focus-visible:bg-background transition-all"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
        />
      </div>
    </div>
  );
}