import { createStore } from 'zustand/vanilla';

export type ViewLabel = 'STRATEGIC' | 'MID' | 'TACTICAL';

export interface ReadoutState {
  zoom: number;
  view: ViewLabel;
  crossfade: number;
}

export const readoutStore = createStore<ReadoutState>(() => ({
  zoom: 1,
  view: 'STRATEGIC',
  crossfade: 0,
}));
