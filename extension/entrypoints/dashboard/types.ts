import type { ReactNode } from 'react';

export type Section =
  | 'home'
  | 'windows'
  | 'library'
  | 'organize'
  | 'providers'
  | 'rules'
  | 'trash'
  | 'settings'
  | 'collection';

export type View = 'grid' | 'list';
export type SortOrder = 'recent' | 'name' | 'domain' | 'tabs';

export type Toast = {
  id: number;
  tone: 'info' | 'success' | 'danger';
  message: string;
};

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  tone: 'danger' | 'brand';
  onConfirm: () => void;
};

export type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
};

export type RuleItem = {
  id: string;
  name: string;
  patterns: string[];
};

export interface PanelProps {
  onNotify: (message: string, tone?: 'info' | 'success' | 'danger') => void;
}

export const VIEW_STORAGE_KEY = 'tabman.library-view';
