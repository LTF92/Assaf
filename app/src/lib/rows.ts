import type { Message } from './types';

export type Row =
  | { key: string; type: 'message'; m: Message }
  | { key: string; type: 'tools'; items: Message[] }
  | { key: string; type: 'card'; m: Message };

/** Turn the message list into display rows: consecutive tool calls collapse into one group. */
export function buildRows(messages: Message[]): Row[] {
  const rows: Row[] = [];
  let group: Message[] = [];
  const flush = () => {
    if (group.length) rows.push({ key: `tools-${group[0].id}`, type: 'tools', items: group });
    group = [];
  };
  for (const m of messages) {
    if (m.deleted) continue;
    if (m.kind === 'tool') {
      group.push(m);
      continue;
    }
    flush();
    if (m.kind === 'card' && m.card) rows.push({ key: m.id, type: 'card', m });
    else rows.push({ key: m.id, type: 'message', m });
  }
  flush();
  return rows;
}

/** Last human-meaningful line for the chat list preview. */
export function preview(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.deleted && m.kind !== 'tool' && !m.interim) return m;
  }
  return undefined;
}
