import React, { createContext, useContext } from 'react';

/** Lets interactive blocks inside a reply (quick replies, forms, checklists) answer the agent. */
export interface BlockActions {
  reply: (text: string) => void;
  enabled: boolean;
}

const Ctx = createContext<BlockActions>({ reply: () => {}, enabled: false });

export function BlockActionsProvider({ value, children }: { value: BlockActions; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBlockActions = () => useContext(Ctx);
