export type CloudSyncSidebarConfig = { enabled: boolean; url: string };
export type CloudSyncSidebarStatus = { passwordConfigured: boolean; lastSyncedAt: string | null; pausedReason: string | null; lastError: string | null };
export type CloudSyncSidebarPresentation = { tone: "healthy" | "muted" | "warning" | "error"; label: string; title: string };

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function cloudSyncSidebarPresentation(config: CloudSyncSidebarConfig, status: CloudSyncSidebarStatus): CloudSyncSidebarPresentation {
  if (!config.enabled) return { tone: "muted", label: "云同步已关闭", title: "云同步已关闭；点击前往设置。" };
  if (!config.url) return { tone: "muted", label: "未配置云同步", title: "尚未配置 WebDAV 服务器；点击前往设置。" };
  if (!status.passwordConfigured) return { tone: "warning", label: "等待配置密码", title: "WebDAV 密码尚未保存在此设备；点击前往设置。" };
  if (status.pausedReason) return { tone: "warning", label: "同步已暂停", title: `同步已暂停：${status.pausedReason}` };
  if (status.lastError) return { tone: "error", label: "同步异常", title: `最近同步失败：${status.lastError}` };
  if (status.lastSyncedAt && !Number.isNaN(new Date(status.lastSyncedAt).getTime())) {
    return { tone: "healthy", label: `已同步 · ${timeLabel(status.lastSyncedAt)}`, title: `最近同步：${new Date(status.lastSyncedAt).toLocaleString("zh-CN")}` };
  }
  return { tone: "warning", label: "等待首次同步", title: "同步器已配置，尚未完成首次同步。" };
}
