import type { ReactNode } from "react";
import { TourButton, type TourId } from "@/components/tour";

type PageTour = Exclude<TourId, "today" | "settings">;

export function PageLayout({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`page-layout ${className}`.trim()}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, tour, actions, actionRows }: { eyebrow: ReactNode; title: string; description: string; tour: PageTour; actions?: ReactNode; actionRows?: ReactNode }) {
  return <header className="page-header page-layout-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div><div className="header-actions">{actionRows ?? <>{actions}<TourButton tour={tour} iconOnly /></>}</div></header>;
}
