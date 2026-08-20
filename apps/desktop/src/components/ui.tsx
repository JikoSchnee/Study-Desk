import { forwardRef, type ButtonHTMLAttributes, type ComponentPropsWithoutRef, type ReactNode } from "react";

export function Button({ variant = "primary", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "outline" | "danger" | "warning"; children: ReactNode }) {
  return <button className={`button ${variant} ${className}`} {...props}>{children}</button>;
}

export const Panel = forwardRef<HTMLElement, ComponentPropsWithoutRef<"section"> & { children: ReactNode }>(function Panel({ children, className = "", ...props }, ref) { return <section ref={ref} className={`panel ${className}`} {...props}>{children}</section>; });

export function Chip({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "green" | "ink" }) { return <span className={`chip ${tone}`}>{children}</span>; }

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-orb">✦</div><h2>{title}</h2><p>{detail}</p>{action}</div>; }
