// Wire types — see docs/protocol.md in the repository root.

export type Role = 'user' | 'assistant' | 'system';
export type Kind = 'text' | 'tool' | 'card' | 'media';

export interface CardAction {
  label: string;
  value: string;
  style?: 'primary' | 'danger' | 'secondary' | '';
}

export interface Card {
  type: 'approval' | 'clarify' | 'confirm';
  state: 'pending' | 'resolved' | 'expired';
  title?: string;
  command?: string;
  description?: string;
  smart_denied?: boolean;
  actions: CardAction[];
  resolution?: { label: string; value: string | null; by?: string } | null;
  awaiting_text?: boolean;
}

export interface ToolInfo {
  name: string;
  status: 'running' | 'ok' | 'error' | 'info';
  args?: string;
  output?: string;
  duration_ms?: number | null;
}

export interface Media {
  id: string;
  kind: 'image' | 'file' | 'audio' | 'video';
  name?: string;
  mime?: string;
  size?: number;
  url?: string;
}

export interface Message {
  id: string;
  rev: number;
  chat_id: string;
  role: Role;
  kind: Kind;
  text: string;
  ts: number;
  updated_ts?: number;
  deleted?: boolean;
  interim?: boolean;
  client_id?: string | null;
  author?: { id: string; name: string };
  attachments?: { name: string; mime: string; size: number }[];
  tool?: ToolInfo | null;
  card?: Card | null;
  media?: Media | null;
  // client-only
  pending?: 'sending' | 'failed';
}

/** A saved pairing: one Hermes profile on one machine. The token lives in SecureStore. */
export interface Connection {
  id: string;
  url: string; // ws:// or wss://
  profile: string;
  label: string;
  role: 'owner' | 'guest';
  createdAt: number;
  color?: string;
}

export type ConnStatus = 'connecting' | 'online' | 'offline' | 'unauthorized';

export interface Attachment {
  name: string;
  mime: string;
  data: string; // base64
  uri?: string; // local preview
}
