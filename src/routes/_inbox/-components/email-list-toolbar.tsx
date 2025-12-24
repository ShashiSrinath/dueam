import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface EmailListToolbarProps {
  isAllSelected: boolean;
  isSomeSelected: boolean;
  onToggleSelectAll: () => void;
  title: string;
  emailCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
}

export function EmailListToolbar({
  isAllSelected,
  isSomeSelected,
  onToggleSelectAll,
  title,
  emailCount,
  searchValue,
  onSearchChange,
}: EmailListToolbarProps) {
  return (
    <div className="p-4 border-b bg-background flex flex-col gap-4 shrink-0">
      <div className="flex justify-between items-center h-8">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
            checked={isAllSelected}
            ref={(el) => {
              if (el) el.indeterminate = isSomeSelected;
            }}
            onChange={onToggleSelectAll}
          />
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        <Badge variant="secondary">{emailCount}</Badge>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search emails..."
          className="pl-9 h-9"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  );
}
