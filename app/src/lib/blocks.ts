/**
 * Rich blocks an agent can put in a reply as a fenced ```hamza code block holding JSON
 * (one object, or an array of them). The shapes follow the approved design (Blocks pages).
 */
export type Tone = 'good' | 'bad' | 'neutral';
export type StepStatus = 'done' | 'running' | 'waiting' | 'failed';

export type HamzaBlock =
  | { type: 'progress'; title: string; percent?: number; steps?: { label: string; status?: StepStatus }[] }
  | { type: 'stats'; items: { label: string; value: string | number; note?: string; tone?: Tone }[] }
  | { type: 'chart'; kind: 'bar' | 'line' | 'pie'; title: string; subtitle?: string; labels?: string[]; values: number[]; unit?: string }
  | { type: 'link'; url: string; title: string; description?: string; image?: string; site?: string }
  | { type: 'location'; title: string; address?: string; lat?: number; lng?: number }
  | { type: 'images'; images: string[]; caption?: string }
  | { type: 'file'; name: string; url?: string; size?: string; meta?: string }
  | { type: 'audio'; url: string; duration?: string }
  | { type: 'video'; url: string; poster?: string; duration?: string }
  | { type: 'choices'; question?: string; options: (string | { label: string; value?: string; primary?: boolean })[] }
  | { type: 'form'; title: string; fields: { name: string; label: string; type?: 'text' | 'date' | 'choice'; options?: string[]; value?: string }[]; submit?: string }
  | { type: 'checklist'; title: string; items: { label: string; done?: boolean }[] };

const TYPES = new Set(['progress', 'stats', 'chart', 'link', 'location', 'images', 'file', 'audio', 'video', 'choices', 'form', 'checklist']);

export const isHamzaLang = (lang?: string) => /^(hamza|hamza-card|hamza-block)$/i.test((lang || '').trim());

/** Parse a hamza fence; null when it isn't valid (the fence is then shown as plain code). */
export function parseBlocks(text: string): HamzaBlock[] | null {
  try {
    const v = JSON.parse(text);
    const list = (Array.isArray(v) ? v : [v]).filter((b) => b && typeof b === 'object' && TYPES.has(b.type));
    return list.length ? (list as HamzaBlock[]) : null;
  } catch {
    return null;
  }
}
