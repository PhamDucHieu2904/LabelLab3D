"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bell,
  Bug,
  CheckCheck,
  CheckCircle2,
  Inbox,
  MailOpen,
  MessageSquareText,
  RefreshCw,
  Reply,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { formatDate, formatNumber } from "@/lib/admin/commerce";
import type { FeedbackCategory, FeedbackItem, FeedbackStatus, FeedbackSummary } from "@/lib/server/feedback";
import type { AdminSentNotification, FeedbackReplyItem, UserNotificationKind } from "@/lib/server/notifications";
import s from "./AdminWorkspace.module.css";
import fs from "./FeedbackPanel.module.css";

type AdminFeedbackItem = FeedbackItem & {
  replies?: FeedbackReplyItem[];
};

type MinimalUserOption = {
  id: string;
  name: string;
  email: string;
  status: "active" | "locked";
};

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

const NOTIF_KIND_META: Record<UserNotificationKind, { label: string; className: string }> = {
  feedback_reply: { label: "Phản hồi góp ý", className: fs.kindReply },
  admin_message: { label: "Từ Admin", className: fs.kindAdmin },
  system: { label: "Hệ thống", className: fs.kindSystem },
};

function FeedbackDetailModal({
  item,
  busy,
  onSave,
  onSendReply,
  onDelete,
  onClose,
}: {
  item: AdminFeedbackItem;
  busy: boolean;
  onSave: (id: string, status: FeedbackStatus, adminNote: string) => Promise<void>;
  onSendReply: (
    item: AdminFeedbackItem,
    title: string,
    body: string,
    markFeedbackResolved: boolean,
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [adminNote, setAdminNote] = useState(item.adminNote);
  const [replyTitle, setReplyTitle] = useState("Phản hồi thư góp ý của bạn");
  const [replyBody, setReplyBody] = useState("");
  const [markResolved, setMarkResolved] = useState(true);
  const [replyError, setReplyError] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const cat = CATEGORY_META[item.category] ?? CATEGORY_META.other;
  const replies = item.replies ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(item.id, status, adminNote);
  }

  async function handleSendReply() {
    if (sendingReply || busy || !item.userId) return;
    const cleanTitle = replyTitle.trim();
    const cleanBody = replyBody.trim();
    if (cleanTitle.length < 2 || cleanBody.length < 2) {
      setReplyError("Vui lòng nhập tiêu đề và nội dung phản hồi (tối thiểu 2 ký tự).");
      return;
    }
    setReplyError("");
    setSendingReply(true);
    try {
      const ok = await onSendReply(item, cleanTitle, cleanBody, markResolved);
      if (ok) {
        setReplyBody("");
        if (markResolved) setStatus("resolved");
      }
    } finally {
      setSendingReply(false);
    }
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

          <div className={fs.replySection}>
            <div className={fs.replyHeader}>
              <span className={fs.replyTitle}>
                <Reply size={15} aria-hidden="true" />
                Phản hồi cho người dùng (gửi tới chuông thông báo)
              </span>
              {replies.length > 0 && (
                <span className={s.subtle}>{replies.length} phản hồi đã gửi</span>
              )}
            </div>

            {replies.length > 0 && (
              <div className={fs.replyHistory}>
                {replies.map((reply) => (
                  <div key={reply.id} className={fs.replyItem}>
                    <div className={fs.replyItemTop}>
                      <strong>{reply.title}</strong>
                      <div className={fs.replyItemMeta}>
                        <span>{reply.senderAdminName} · {formatDate(reply.createdAt)}</span>
                        <span className={reply.readAt ? fs.replyReadBadge : fs.replyUnreadBadge}>
                          {reply.readAt ? "Đã xem" : "Chưa xem"}
                        </span>
                      </div>
                    </div>
                    <p className={fs.replyItemBody}>{reply.body}</p>
                  </div>
                ))}
              </div>
            )}

            {item.userId ? (
              <div className={s.formGrid}>
                <label className={`${s.field} ${s.fullWidth}`}>
                  Tiêu đề thông báo
                  <input
                    type="text"
                    className={s.input}
                    value={replyTitle}
                    onChange={(e) => {
                      setReplyTitle(e.target.value);
                      if (replyError) setReplyError("");
                    }}
                    maxLength={160}
                    disabled={busy || sendingReply}
                  />
                </label>

                <label className={`${s.field} ${s.fullWidth}`}>
                  Nội dung phản hồi tới người dùng
                  <textarea
                    className={s.textarea}
                    value={replyBody}
                    onChange={(e) => {
                      setReplyBody(e.target.value);
                      if (replyError) setReplyError("");
                    }}
                    placeholder="Viết phản hồi của Admin — sẽ hiển thị trực tiếp ở chuông thông báo của người dùng này..."
                    maxLength={2000}
                    rows={3}
                    disabled={busy || sendingReply}
                  />
                </label>

                <div className={`${fs.replyCheckRow} ${s.fullWidth}`}>
                  <label className={fs.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={markResolved}
                      onChange={(e) => setMarkResolved(e.target.checked)}
                      disabled={busy || sendingReply}
                    />
                    Tự động đánh dấu &quot;Đã xử lý&quot; sau khi gửi
                  </label>

                  <button
                    type="button"
                    className={s.primary}
                    disabled={busy || sendingReply || replyTitle.trim().length < 2 || replyBody.trim().length < 2}
                    onClick={() => void handleSendReply()}
                  >
                    <Send size={14} aria-hidden="true" />
                    {sendingReply ? "Đang gửi..." : "Gửi phản hồi"}
                  </button>
                </div>

                {replyError && <p role="alert" className={`${s.formError} ${s.fullWidth}`}>{replyError}</p>}
              </div>
            ) : (
              <p className={fs.guestReplyNote}>
                Thư góp ý này được gửi trước khi bắt buộc đăng nhập (khách ẩn danh) nên không có tài khoản nhận thông báo trong chuông.
              </p>
            )}
          </div>

          <div className={s.formGrid}>
            <label className={`${s.field} ${s.fullWidth}`}>
              Trạng thái xử lý
              <select
                className={s.select}
                value={status}
                onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
                disabled={busy || sendingReply}
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
                disabled={busy || sendingReply}
              />
            </label>
          </div>
        </div>

        <div className={fs.modalFooterSplit}>
          <button
            type="button"
            className={s.danger}
            disabled={busy || sendingReply}
            onClick={() => void onDelete(item.id)}
          >
            <Trash2 size={15} aria-hidden="true" />
            Xóa thư
          </button>

          <div className={s.inline}>
            <button type="button" className={s.secondary} onClick={onClose} disabled={busy || sendingReply}>
              Đóng
            </button>
            <button type="submit" className={s.primary} disabled={busy || sendingReply}>
              {busy ? "Đang lưu..." : "Lưu trạng thái & ghi chú"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

function ComposeNotificationModal({
  users,
  loadingUsers,
  busy,
  onSend,
  onClose,
}: {
  users: MinimalUserOption[];
  loadingUsers: boolean;
  busy: boolean;
  onSend: (payload: { target: "user" | "all"; userId?: string; title: string; body: string }) => Promise<string | null>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [target, setTarget] = useState<"user" | "all">("user");
  const [userId, setUserId] = useState<string>(users[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const effectiveUserId = userId || users[0]?.id || "";
  const activeCount = users.filter((u) => u.status === "active").length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (target === "user" && !effectiveUserId) {
      setFormError("Vui lòng chọn người dùng nhận thông báo.");
      return;
    }
    if (cleanTitle.length < 2 || cleanBody.length < 2) {
      setFormError("Vui lòng nhập tiêu đề và nội dung (tối thiểu 2 ký tự).");
      return;
    }
    setFormError("");
    const err = await onSend({
      target,
      userId: target === "user" ? effectiveUserId : undefined,
      title: cleanTitle,
      body: cleanBody,
    });
    if (err) setFormError(err);
    else onClose();
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
        <h2 id={titleId}>Gửi thông báo tới chuông người dùng</h2>
        <button type="button" className={s.iconButton} aria-label="Đóng" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)}>
        <div className={s.modalBody}>
          <div className={s.formGrid}>
            <label className={`${s.field} ${s.fullWidth}`}>
              Đối tượng nhận
              <select
                className={s.select}
                value={target}
                onChange={(e) => setTarget(e.target.value as "user" | "all")}
                disabled={busy}
              >
                <option value="user">Một người dùng cụ thể</option>
                <option value="all">
                  Tất cả người dùng đang hoạt động ({activeCount} tài khoản)
                </option>
              </select>
            </label>

            {target === "user" && (
              <label className={`${s.field} ${s.fullWidth}`}>
                Chọn người dùng
                <select
                  className={s.select}
                  value={effectiveUserId}
                  onChange={(e) => setUserId(e.target.value)}
                  disabled={busy || loadingUsers}
                  required
                >
                  {loadingUsers && <option value="">Đang tải danh sách người dùng...</option>}
                  {!loadingUsers && users.length === 0 && <option value="">Không có tài khoản nào</option>}
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email}){u.status === "locked" ? " [Đã khóa]" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={`${s.field} ${s.fullWidth}`}>
              Tiêu đề thông báo
              <input
                type="text"
                className={s.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ví dụ: Cập nhật hỗ trợ tài khoản hoặc quà tặng từ HyperMockup"
                maxLength={160}
                required
                disabled={busy}
              />
            </label>

            <label className={`${s.field} ${s.fullWidth}`}>
              Nội dung thông báo
              <textarea
                className={s.textarea}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Nội dung sẽ xuất hiện trực tiếp trong biểu tượng chuông trên thanh điều hướng của người dùng..."
                maxLength={2000}
                rows={4}
                required
                disabled={busy}
              />
            </label>
          </div>
          {formError && <p role="alert" className={s.formError}>{formError}</p>}
        </div>

        <div className={s.modalFooter}>
          <button type="button" className={s.secondary} onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className={s.primary} disabled={busy}>
            <Send size={14} aria-hidden="true" />
            {busy ? "Đang gửi..." : "Gửi thông báo"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function FeedbackPanel() {
  const [view, setView] = useState<"feedback" | "sent">("feedback");
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [sentItems, setSentItems] = useState<AdminSentNotification[]>([]);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentLoaded, setSentLoaded] = useState(false);
  const [userOptions, setUserOptions] = useState<MinimalUserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
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
  const [sentQuery, setSentQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FeedbackCategory>("all");
  const [selected, setSelected] = useState<AdminFeedbackItem | null>(null);

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
      const data = (await response.json()) as { items?: AdminFeedbackItem[]; summary?: FeedbackSummary };
      const loadedItems = data.items ?? [];
      setItems(loadedItems);
      setSelected((prev) => (prev ? loadedItems.find((row) => row.id === prev.id) ?? prev : null));
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

  const loadSent = useCallback(async () => {
    setSentLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/notifications", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Không thể tải lịch sử thông báo đã gửi.");
      const data = (await response.json()) as { items?: AdminSentNotification[] };
      setSentItems(data.items ?? []);
      setSentLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải lịch sử thông báo.");
    } finally {
      setSentLoading(false);
    }
  }, []);

  const ensureUsersLoaded = useCallback(async () => {
    if (userOptions.length > 0 || loadingUsers) return;
    setLoadingUsers(true);
    try {
      const response = await fetch("/api/admin/users", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { users?: MinimalUserOption[] };
      setUserOptions(data.users ?? []);
    } finally {
      setLoadingUsers(false);
    }
  }, [loadingUsers, userOptions.length]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void load(); });
    return () => cancelAnimationFrame(frame);
  }, [load]);

  const announce = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 4500);
  };

  const openCompose = () => {
    setComposeOpen(true);
    void ensureUsersLoaded();
  };

  const openDetail = async (item: AdminFeedbackItem) => {
    if (item.status === "new") {
      // Mark as read immediately when opened so admin inbox stays clean.
      const optimistic: AdminFeedbackItem = { ...item, status: "read" };
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

  const sendFeedbackReply = async (
    item: AdminFeedbackItem,
    title: string,
    body: string,
    markFeedbackResolved: boolean,
  ): Promise<boolean> => {
    if (!item.userId) return false;
    setError("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "user",
          userId: item.userId,
          feedbackId: item.id,
          kind: "feedback_reply",
          title,
          body,
          markFeedbackResolved,
        }),
      });
      const resBody = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(resBody?.error ?? "Không thể gửi phản hồi.");
      }
      await load();
      if (sentLoaded) void loadSent();
      announce(`Đã gửi phản hồi tới chuông thông báo của ${item.senderName || item.senderEmail || "người dùng"}.`);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gửi phản hồi thất bại.");
      return false;
    }
  };

  const sendComposedNotification = async (payload: {
    target: "user" | "all";
    userId?: string;
    title: string;
    body: string;
  }): Promise<string | null> => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: payload.target,
          userId: payload.userId,
          kind: "admin_message",
          title: payload.title,
          body: payload.body,
        }),
      });
      const resBody = (await response.json().catch(() => null)) as {
        error?: string;
        sentCount?: number;
      } | null;
      if (!response.ok) {
        return resBody?.error ?? "Không thể gửi thông báo.";
      }
      if (sentLoaded || view === "sent") {
        await loadSent();
      }
      if (payload.target === "all") {
        announce(`Đã gửi thông báo tới ${formatNumber(resBody?.sentCount ?? 0)} người dùng đang hoạt động.`);
      } else {
        const picked = userOptions.find((u) => u.id === payload.userId);
        announce(`Đã gửi thông báo tới chuông của ${picked ? picked.email : "người dùng"}.`);
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Gửi thông báo thất bại.";
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

  const filteredSent = useMemo(() => {
    const q = sentQuery.trim().toLowerCase();
    if (!q) return sentItems;
    return sentItems.filter((item) =>
      `${item.recipientName} ${item.recipientEmail} ${item.title} ${item.body} ${item.senderAdminName}`
        .toLowerCase()
        .includes(q),
    );
  }, [sentItems, sentQuery]);

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

      <div className={fs.viewRow}>
        <div className={fs.viewSwitch} role="group" aria-label="Chế độ xem góp ý và thông báo">
          <button
            type="button"
            className={fs.viewSwitchBtn}
            aria-pressed={view === "feedback"}
            onClick={() => setView("feedback")}
          >
            <Inbox size={15} aria-hidden="true" />
            Hộp thư góp ý ({summary.total})
          </button>
          <button
            type="button"
            className={fs.viewSwitchBtn}
            aria-pressed={view === "sent"}
            onClick={() => {
              setView("sent");
              if (!sentLoaded && !sentLoading) void loadSent();
            }}
          >
            <Bell size={15} aria-hidden="true" />
            Thông báo đã gửi{sentLoaded ? ` (${sentItems.length})` : ""}
          </button>
        </div>

        <button type="button" className={s.primary} onClick={openCompose} disabled={busy}>
          <Send size={15} aria-hidden="true" />
          Gửi thông báo tới user
        </button>
      </div>

      {view === "feedback" ? (
        <>
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
                      const replyCount = item.replies?.length ?? 0;
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
                            {replyCount > 0 && (
                              <span className={fs.repliedBadge}>
                                <Reply size={11} aria-hidden="true" />
                                Đã phản hồi ({replyCount})
                              </span>
                            )}
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
                                Xem &amp; phản hồi
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
        </>
      ) : (
        <>
          <div className={s.toolbar}>
            <div className={s.search}>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                className={s.input}
                placeholder="Tìm theo người nhận, tiêu đề, nội dung..."
                value={sentQuery}
                onChange={(e) => setSentQuery(e.target.value)}
              />
            </div>

            <div className={s.actions}>
              <button type="button" className={s.secondary} disabled={sentLoading || busy} onClick={() => void loadSent()}>
                <RefreshCw size={15} aria-hidden="true" />
                Làm mới
              </button>
            </div>
          </div>

          {error && <p className={s.formError} style={{ marginBottom: 14 }}>{error}</p>}

          <div className={s.panel}>
            {sentLoading ? (
              <div className={s.empty}>Đang tải lịch sử thông báo...</div>
            ) : filteredSent.length === 0 ? (
              <div className={s.empty}>
                <Bell size={28} style={{ opacity: 0.45, marginBottom: 8 }} aria-hidden="true" />
                <div>Chưa có thông báo nào được gửi tới người dùng.</div>
              </div>
            ) : (
              <div className={s.tableScroll}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Người nhận</th>
                      <th>Loại</th>
                      <th>Nội dung thông báo</th>
                      <th>Trạng thái đọc</th>
                      <th>Người gửi &amp; Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSent.map((n) => {
                      const kindMeta = NOTIF_KIND_META[n.kind] ?? NOTIF_KIND_META.admin_message;
                      return (
                        <tr key={n.id}>
                          <td>
                            <div className={s.userName}>
                              <strong>{n.recipientName}</strong>
                              <small>{n.recipientEmail || n.userId}</small>
                            </div>
                          </td>
                          <td>
                            <span className={`${fs.categoryPill} ${kindMeta.className}`}>{kindMeta.label}</span>
                          </td>
                          <td className={fs.messageCell}>
                            <div style={{ fontWeight: 620, color: "#1f2128", marginBottom: 2 }}>{n.title}</div>
                            <div className={fs.messagePreview}>{n.body}</div>
                          </td>
                          <td>
                            <span className={n.readAt ? fs.replyReadBadge : fs.replyUnreadBadge}>
                              {n.readAt ? `Đã xem · ${formatDate(n.readAt)}` : "Chưa xem"}
                            </span>
                          </td>
                          <td>
                            <div className={s.userName}>
                              <strong>{n.senderAdminName}</strong>
                              <small>{formatDate(n.createdAt)}</small>
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
        </>
      )}

      {selected && (
        <FeedbackDetailModal
          key={selected.id}
          item={selected}
          busy={busy}
          onSave={saveDetail}
          onSendReply={sendFeedbackReply}
          onDelete={deleteItem}
          onClose={() => setSelected(null)}
        />
      )}

      {composeOpen && (
        <ComposeNotificationModal
          users={userOptions}
          loadingUsers={loadingUsers}
          busy={busy}
          onSend={sendComposedNotification}
          onClose={() => setComposeOpen(false)}
        />
      )}

      {notice && <div className={s.toast} role="status">{notice}</div>}
    </>
  );
}
