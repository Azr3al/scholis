"use client";

import React from "react";
import { Input } from "@/components/primitives";
import { Search } from "iconoir-react";

const ChatSearch = ({
  value,
  onChange,
  placeholder = "Search courses…",
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
}) => {
  return (
    <div className="relative">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        className="pl-9 h-9 rounded-full bg-muted/50 border-0 text-sm focus-visible:ring-2"
        aria-label="Search course chats"
        autoComplete="off"
      />
    </div>
  );
};

export default ChatSearch;
