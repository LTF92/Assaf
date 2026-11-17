import type { FavoriteModel } from './settings';

/** "claude-opus-5-5" → "Opus 5.5", "gpt-6-astra" → "GPT-6 Astra", "google/gemini-3-pro" → "Gemini 3 Pro". */
export function modelLabel(id: string): string {
  const base = (id.split('/').pop() || id).replace(/^claude-/, '');
  const out: string[] = [];
  for (const w of base.split(/[-_]/).filter(Boolean)) {
    const last = out[out.length - 1];
    if (/^\d+$/.test(w) && last && /\d$/.test(last)) out[out.length - 1] = `${last}.${w}`;
    else if (/^\d/.test(w) && last === 'GPT') out[out.length - 1] = `GPT-${w}`;
    else if (w.toLowerCase() === 'gpt') out.push('GPT');
    else out.push(w.charAt(0).toUpperCase() + w.slice(1));
  }
  return out.join(' ');
}

export const sameModel = (a?: FavoriteModel | null, b?: FavoriteModel | null) =>
  !!a && !!b && a.id === b.id && (a.provider || '') === (b.provider || '');

/** The message that asks Hermes to switch this chat's model (session-scoped, like typing /model). */
export function modelCommand(m: FavoriteModel): string {
  return m.provider ? `/model ${m.id} --provider ${m.provider}` : `/model ${m.id}`;
}

/** A /model message the app sent from the menu: shown as a small note instead of a bubble. */
export function parseModelCommand(text: string): FavoriteModel | null {
  const m = /^\/model\s+(\S+)(?:\s+--provider\s+(\S+))?\s*$/.exec((text || '').trim());
  return m ? { id: m[1], provider: m[2] ?? '' } : null;
}
