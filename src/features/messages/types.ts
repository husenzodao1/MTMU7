export interface ThreadMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_first_name: string | null;
  sender_last_name: string | null;
  sender_avatar_url: string | null;
  content: string;
  type: string;
  reply_to_id: string | null;
  is_pinned: boolean;
  is_edited: boolean;
  is_deleted: boolean;
  is_favorite: boolean;
  created_at: string;
  edited_at: string | null;
  /** Set only on type === "location". */
  location_lat: number | null;
  location_lng: number | null;
  /** Set on photos, files and voice notes: where the file is kept. */
  media_path: string | null;
  /** A photo's size in pixels. */
  media_width: number | null;
  media_height: number | null;
  /** A file's own name, as it was sent. */
  media_name?: string | null;
  /** Bytes, for files and voice notes. */
  media_size?: number | null;
  media_mime?: string | null;
  /** A voice note's length in seconds. */
  media_duration?: number | null;
  /** Who reacted with what; one per person. */
  reactions?: Reaction[];
  /** Client-side only: the photo on this device, before it has been uploaded. */
  local_preview?: string;
  /** Client-side only: this one has not reached the server yet, or did not. */
  pending?: boolean;
  failed?: boolean;
}

export interface Reaction {
  user_id: string;
  emoji: string;
}

/** The row of quick reactions, as in the messenger everybody knows. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/** More, a tap further away. */
export const MORE_REACTIONS = [
  "👏", "🔥", "🎉", "💯", "✅", "👌", "🤝", "💪", "🙌", "😊", "😍", "🥰", "😎", "🤔", "😅", "🤣",
  "😇", "😴", "😡", "😱", "🥺", "😭", "🤗", "🙂", "👀", "⭐", "🌸", "📚", "✏️", "🏆", "🎓", "❗",
] as const;

export interface ConversationMember {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
  /** When this member last opened the conversation; drives the second tick. */
  last_read_at?: string | null;
}

export interface ContactResult {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  roles: Array<{ slug: string; name_tg: string; name_ru: string | null; name_en: string | null }>;
}

export const MESSAGE_MAX_LENGTH = 5000;
export const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
export const REPORT_REASONS = ["abuse", "bullying", "spam", "inappropriate", "privacy", "other"] as const;

/** Group name, or the other participant's name for direct conversations. */
export function conversationTitle(
  conversation: { type: string; name: string | null; members: ConversationMember[] | null },
  currentUserId: string,
  fallback: string
): string {
  if (conversation.type !== "direct" && conversation.name) return conversation.name;
  const other = conversation.members?.find((m) => m.user_id !== currentUserId);
  return other ? `${other.first_name ?? ""} ${other.last_name ?? ""}`.trim() || fallback : fallback;
}
