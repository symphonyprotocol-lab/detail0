import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function SectionHeading({ kicker, title, description, align = "center", action }: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  action?: ReactNode;
}) {
  return (
    <div className={`section-heading ${align === "left" ? "align-left" : ""}`}>
      {kicker && <Badge className="section-kicker">{kicker}</Badge>}
      <div className="section-heading-row">
        <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
        {action}
      </div>
    </div>
  );
}
