// The caller's notification inbox: what changed in the spaces they are an
// explicit editor (or above) of, agent run outcomes there, and — for org
// admins — membership transitions. Human principals only: an agent key gets a
// 403 (CocoPermissionError) because agents are never recipients.

import type { CocoHttp } from "../http.js";
import type {
  NotificationListOptions,
  NotificationListResult,
  NotificationMarkAllReadOptions,
  NotificationUnreadSummary,
} from "../types.js";

export class NotificationsApi {
  constructor(private readonly http: CocoHttp) {}

  /** Newest first. `unreadOnly` and `space` narrow the rows; page with `before`. */
  list(options: NotificationListOptions = {}): Promise<NotificationListResult> {
    return this.http.requestJson<NotificationListResult>("GET", "/notifications", {
      query: {
        unread: options.unreadOnly ? "1" : undefined,
        space: options.space,
        limit: options.limit,
        before: options.before,
      },
    });
  }

  /**
   * The badge numbers: unread rows the caller can currently see, how many of
   * them need the caller, and the same split per space.
   */
  unreadCount(): Promise<NotificationUnreadSummary> {
    return this.http.requestJson<NotificationUnreadSummary>("GET", "/notifications/unread-count");
  }

  /** Mark one or more rows read. Idempotent; unknown ids count as 0. */
  markRead(ids: string | string[]): Promise<{ updated: number }> {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length === 1) {
      return this.http.requestJson<{ updated: number }>(
        "POST",
        `/notifications/${encodeURIComponent(list[0])}/read`,
      );
    }
    return this.http.requestJson<{ updated: number }>("POST", "/notifications/read", {
      body: { ids: list },
    });
  }

  /** Clear the inbox, or one space's slice of it; `scope: "activity"` keeps the rows that need the caller unread. */
  markAllRead(options: NotificationMarkAllReadOptions = {}): Promise<{ updated: number }> {
    return this.http.requestJson<{ updated: number }>("POST", "/notifications/read-all", {
      query: { space: options.space, scope: options.scope },
    });
  }
}
