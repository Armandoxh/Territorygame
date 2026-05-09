import { createStore } from 'zustand/vanilla';

// Manual zoom only ever reports STRATEGIC or OPERATIONAL. TACTICAL is
// reserved for battle-driven camera (not yet implemented).
export type ViewLabel = 'STRATEGIC' | 'OPERATIONAL' | 'TACTICAL';

export interface ReadoutState {
  zoom: number;
  view: ViewLabel;
}

export const readoutStore = createStore<ReadoutState>(() => ({
  zoom: 1,
  view: 'STRATEGIC',
}));
