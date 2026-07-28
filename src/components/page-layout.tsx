import type { ReactNode } from "react";
import { TourButton, type TourId } from "@/components/tour";

type PageTour = Exclude<TourId, "onboarding" | "today" | "settings">;

export function PageLayout({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`page-layout ${className}`.trim()}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, tour, actions }: { eyebrow: ReactNode; title: string; description: string; tour: PageTour; actions?: ReactNode }) {
  return <header className="page-header page-layout-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div><div className="header-actions">{actions}<TourButton tour={tour} iconOnly /></div></header>;
}
