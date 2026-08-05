"use client";

import { useId } from "react";
import { CircleHelp } from "lucide-react";

export function SettingHelp({ label, children }: { label: string; children: string }) {
  const tooltipId = useId();
  return <span className="setting-help" tabIndex={0} aria-label={`${label}说明`} aria-describedby={tooltipId}><CircleHelp size={15} aria-hidden="true"/><span id={tooltipId} className="setting-help-tooltip" role="tooltip">{children}</span></span>;
}
