import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border-dark bg-background px-3 py-1 text-xs font-semibold text-foreground",
        className,
      )}
      {...props}
    />
  );
}
