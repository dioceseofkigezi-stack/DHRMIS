import type { ReactNode } from "react";
import { Icon, type SystemIcon } from "@/components/ui/Icon";

export const ADMIN_PAGE_SIZE = 25;

export function AdminPageHeader({ title, description, icon = "settings", actions }: {
  title: string;
  description: string;
  icon?: SystemIcon;
  actions?: ReactNode;
}) {
  return <header className="page-heading admin-page-heading">
    <div><p className="eyebrow">SUPER/SYSTEM ADMINISTRATION</p><h1><Icon name={icon} size={23} />{title}</h1><p className="muted">{description}</p></div>
    {actions && <div className="admin-heading-actions">{actions}</div>}
  </header>;
}

export function AdminPagination({ page, pageSize = ADMIN_PAGE_SIZE, total, onPage }: {
  page: number;
  pageSize?: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  return <footer className="pagination-bar" aria-label="Pagination">
    <span>Showing {start}–{end} of {total.toLocaleString()}</span>
    <div>
      <button className="button button-secondary button-small" type="button" onClick={() => onPage(page - 1)} disabled={page <= 0}>Previous</button>
      <span className="admin-page-count">Page {Math.min(page + 1, pageCount)} of {pageCount}</span>
      <button className="button button-secondary button-small" type="button" onClick={() => onPage(page + 1)} disabled={page + 1 >= pageCount}>Next</button>
    </div>
  </footer>;
}

export function AdminStatus({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "neutral" }) {
  return <span className={`admin-status admin-status-${tone}`}>{children}</span>;
}

export function formatAdminDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function adminErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error && error.code === "42501") {
    return "This account is not allowed to perform that system administration action.";
  }
  if (error instanceof Error && /network|fetch/i.test(error.message)) return "The system data service could not be reached. Check your connection and try again.";
  return fallback;
}

export function AdminNotice({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "warning" | "success" }) {
  return <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}
