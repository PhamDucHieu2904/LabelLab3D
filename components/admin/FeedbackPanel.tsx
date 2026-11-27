"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bug,
  CheckCheck,
  CheckCircle2,
  Inbox,
  MailOpen,
  MessageSquareText,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatDate, formatNumber } from "@/lib/admin/commerce";
import type { FeedbackCategory, FeedbackItem, FeedbackStatus, FeedbackSummary } from "@/lib/server/feedback";
import s from "./AdminWorkspace.module.css";
import fs from "./FeedbackPanel.module.css";

const CATEGORY_META: Record<FeedbackCategory, { label: string; className: string }> = {
  suggestion: { label: "Góp ý", className: fs.catSuggestion },
  bug: { label: "Báo lỗi", className: fs.catBug },
  model_request: { label: "Mẫu 3D", className: fs.catModel },
  other: { label: "Khác", className: fs.catOther },
};

const STATUS_META: Record<FeedbackStatus, { label: string; className: string }> = {
  new: { label: "Chưa đọc", className: fs.statusNew },
  read: { label: "Đã đọc", className: fs.statusRead },
  resolved: { label: "Đã xử lý", className: fs.statusResolved },
  archived: { label: "Lưu trữ", className: fs.statusArchived },
};

function FeedbackDetailModal({
  item,
  busy,
  onSave,
  onDelete,
  onClose,
}: {
  item: FeedbackItem;
  busy: boolean;
  onSave: (id: string, status: FeedbackStatus, adminNote: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [adminNote, setAdminNote] = useState(item.adminNote);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const cat = CATEGORY_META[item.category] ?? CATEGORY_META.other;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(item.id, status, adminNote);
  }

  return (
    <dialog
      ref={ref}
      className={s.modal}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) onClose();
        }
      }}
    >
      <div className={s.modalHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <h2 id={titleId}>Chi tiết thư góp ý</h2>
          <span className={`${fs.categoryPill} ${cat.className}`}>{cat.label}</span>
        </div>
        <button type="button" className={s.iconButton} aria-label="Đóng" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className={s.modalBody}>
          <div className={fs.modalMeta}>
            <span>
              Người gửi: <strong>{item.senderName || (item.userId ? "Thành viên" : "Khách")}</strong>
            </span>
            {item.senderEmail && (
              <span>
                Email: <strong>{item.senderEmail}</strong>
              </span>
            )}
            <span>
              Thời gian: <strong>{formatDate(item.createdAt)}</strong>
            </span>
            <span>
              Ngôn ngữ: <strong>{item.locale.toUpperCase()}</strong>
            </span>
          </div>

          <div className={fs.messageBox}>{item.message}</div>

          <div className={s.formGrid}>
            <label className={`${s.field} ${s.fullWidth}`}>
              Trạng thái xử lý
              <select
                className={s.select}
                value={status}
                onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
                disabled={busy}
              >
                <option value="new">Chưa đọc</option>
                <option value="read">Đã đọc</option>
                <option value="resolved">Đã xử lý</option>
                <option value="archived">Lưu trữ</option>
              </select>
            </label>

            <label className={`${s.field} ${s.fullWidth}`}>
              Ghi chú quản trị (nội bộ)
              <textarea
                className={s.textarea}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Ghi lại cách xử lý hoặc ghi chú cho đội ngũ..."
                maxLength={1000}
                disabled={busy}
              />
            </label>
          </div>
        </div>

        <div className={fs.modalFooterSplit}>
          <button
            type="button"
            className={s.danger}
            disabled={busy}
            onClick={() => void onDelete(item.id)}
          >
            <Trash2 size={15} aria-hidden="true" />
            Xóa thư
          </button>

          <div className={s.inline}>
            <button type="button" className={s.secondary} onClick={onClose} disabled={busy}>
              Đóng
            </button>
            <button type="submit" className={s.primary} disabled={busy}>
              {busy ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

export default function FeedbackPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary>({
    total: 0,
    newCount: 0,
    readCount: 0,
    resolvedCount: 0,
    bugCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FeedbackCategory>("all");
  const [selected, setSelected] = useState<FeedbackItem | null>(null);

  const syncSidebarBadge = (newCount: number) => {
    window.dispatchEvent(new CustomEvent("admin-feedback-updated", { detail: { newCount } }));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/feedback", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Không thể tải hộp thư góp ý từ D1.");
      const data = (await response.json()) as { items?: FeedbackItem[]; summary?: FeedbackSummary };
      setItems(data.items ?? []);
      if (data.summary) {
        setSummary(data.summary);
        syncSidebarBadge(data.summary.newCount);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const announce = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 4000);
  };

  const openDetail = async (item: FeedbackItem) => {
    if (item.status === "new") {
      // Mark as read immediately when opened so admin inbox stays clean.
      const optimistic: FeedbackItem = { ...item, status: "read" };
      setSelected(optimistic);
      setItems((prev) => prev.map((row) => (row.id === item.id ? optimistic : row)));
      setSummary((prev) => {
        const nextNew = Math.max(0, prev.newCount - 1);
        syncSidebarBadge(nextNew);
        return { ...prev, newCount: nextNew, readCount: prev.readCount + 1 };
      });
      void fetch("/api/admin/feedback", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, status: "read" }),
      }).catch(() => undefined);
    } else {
      setSelected(item);
    }
  };

  const saveDetail = async (id: string, status: FeedbackStatus, adminNote: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, adminNote }),
      });
      if (!response.ok) throw new Error("Không thể cập nhật trạng thái thư góp ý.");
      setSelected(null);
      await load();
      announce("Đã cập nhật thư góp ý.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cập nhật thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const markAllRead = async () => {
    if (busy || summary.newCount === 0) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (!response.ok) throw new Error("Không thể đánh dấu tất cả đã đọc.");
      await load();
      announce("Đã đánh dấu tất cả thư góp ý là đã đọc.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cập nhật thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa vĩnh viễn thư góp ý này?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Không thể xóa thư góp ý.");
      if (selected?.id === id) setSelected(null);
      await load();
      announce("Đã xóa thư góp ý.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xóa thất bại.");
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.message.toLowerCase().includes(q) ||
        item.senderName.toLowerCase().includes(q) ||
        item.senderEmail.toLowerCase().includes(q) ||
        item.adminNote.toLowerCase().includes(q)
      );
    });
  }, [items, query, statusFilter, categoryFilter]);

  return (
    <>
      <div className={s.stats}>
        <div className={s.stat}>
          <div className={s.statTop}>
            <span>Tổng thư góp ý</span>
            <Inbox size={18} />
          </div>
          <div className={s.statValue}>{formatNumber(summary.total)}</div>
          <div className={s.statBottom}>Lưu trực tiếp trên Cloudflare D1</div>
        </div>
        <div className={s.stat}>
          <div className={s.statTop}>
            <span>Chưa đọc</span>
            <MessageSquareText size={18} />
          </div>
          <div className={s.statValue}>{formatNumber(summary.newCount)}</div>
          <div className={s.statBottom}>
            {summary.newCount > 0 ? <span className={s.negative}>Cần kiểm tra</span> : <span className={s.positive}>Đã xem hết</span>}
          </div>
        </div>
        <div className={s.stat}>
          <div className={s.statTop}>
            <span>Báo lỗi đang mở</span>
            <Bug size={18} />
          </div>
          <div className={s.statValue}>{formatNumber(summary.bugCount)}</div>
          <div className={s.statBottom}>Phân loại Báo lỗi chưa lưu trữ</div>
        </div>
        <div className={s.stat}>
          <div className={s.statTop}>
            <span>Đã xử lý</span>
            <CheckCircle2 size={18} />
          </div>
          <div className={s.statValue}>{formatNumber(summary.resolvedCount)}</div>
          <div className={s.statBottom}>
            <span className={s.positive}>Hoàn tất phản hồi</span>
          </div>
        </div>
      </div>

      <div className={s.tabs} role="tablist" aria-label="Lọc trạng thái góp ý">
        {(
          [
            { key: "all", label: `Tất cả (${summary.total})` },
            { key: "new", label: `Chưa đọc (${summary.newCount})` },
            { key: "read", label: `Đã đọc (${summary.readCount})` },
            { key: "resolved", label: `Đã xử lý (${summary.resolvedCount})` },
            { key: "archived", label: "Lưu trữ" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={statusFilter === tab.key}
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={s.toolbar}>
        <div className={s.search}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            className={s.input}
            placeholder="Tìm theo nội dung, người gửi, email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className={s.actions}>
          <select
            className={s.select}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as "all" | FeedbackCategory)}
            aria-label="Lọc theo phân loại"
          >
            <option value="all">Tất cả phân loại</option>
            <option value="suggestion">Góp ý</option>
            <option value="bug">Báo lỗi</option>
            <option value="model_request">Mẫu 3D</option>
            <option value="other">Khác</option>
          </select>

          {summary.newCount > 0 && (
            <button type="button" className={s.secondary} disabled={busy} onClick={() => void markAllRead()}>
              <CheckCheck size={15} aria-hidden="true" />
              Đánh dấu tất cả đã đọc
            </button>
          )}

          <button type="button" className={s.secondary} disabled={loading || busy} onClick={() => void load()}>
            <RefreshCw size={15} aria-hidden="true" />
            Làm mới
          </button>
        </div>
      </div>

      {error && <p className={s.formError} style={{ marginBottom: 14 }}>{error}</p>}

      <div className={s.panel}>
        {loading ? (
          <div className={s.empty}>Đang tải thư góp ý...</div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>
            <MailOpen size={28} style={{ opacity: 0.45, marginBottom: 8 }} aria-hidden="true" />
            <div>Chưa có thư góp ý nào phù hợp bộ lọc.</div>
          </div>
        ) : (
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Người gửi</th>
                  <th>Phân loại</th>
                  <th>Nội dung góp ý</th>
                  <th>Trạng thái</th>
                  <th>Thời gian</th>
                  <th className={s.alignRight}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const cat = CATEGORY_META[item.category] ?? CATEGORY_META.other;
                  const st = STATUS_META[item.status] ?? STATUS_META.read;
                  return (
                    <tr key={item.id}>
                      <td>
                        <div className={fs.senderCell}>
                          {item.status === "new" && <span className={fs.unreadDot} title="Chưa đọc" />}
                          <div className={s.userName}>
                            <strong>{item.senderName || (item.userId ? "Thành viên" : "Khách")}</strong>
                            <small>{item.senderEmail || (item.userId ? "Tài khoản nội bộ" : "Ẩn danh")}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`${fs.categoryPill} ${cat.className}`}>{cat.label}</span>
                      </td>
                      <td className={`${fs.messageCell} ${item.status === "new" ? fs.messageUnread : ""}`}>
                        <div className={fs.messagePreview}>{item.message}</div>
                        {item.adminNote && (
                          <span className={fs.notePreview}>Ghi chú: {item.adminNote.slice(0, 60)}{item.adminNote.length > 60 ? "…" : ""}</span>
                        )}
                      </td>
                      <td>
                        <span className={`${fs.statusPill} ${st.className}`}>{st.label}</span>
                      </td>
                      <td className={s.subtle}>{formatDate(item.createdAt)}</td>
                      <td className={s.alignRight}>
                        <div className={fs.rowActions}>
                          <button type="button" onClick={() => void openDetail(item)}>
                            Xem chi tiết
                          </button>
                          <button
                            type="button"
                            className={fs.deleteBtn}
                            disabled={busy}
                            onClick={() => void deleteItem(item.id)}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <FeedbackDetailModal
          item={selected}
          busy={busy}
          onSave={saveDetail}
          onDelete={deleteItem}
          onClose={() => setSelected(null)}
        />
      )}

      {notice && <div className={s.toast} role="status">{notice}</div>}
    </>
  );
}
