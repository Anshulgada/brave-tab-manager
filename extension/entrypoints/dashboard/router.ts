import { useCallback, useEffect, useState } from 'react';
import type { Section } from './types';

export interface RouteState {
  section: Section;
  collectionId?: string;
}

export function parseHash(hashString: string): RouteState {
  const raw = hashString.replace(/^#\/?/, '').trim();
  if (!raw || raw === 'home') {
    return { section: 'home' };
  }
  if (raw === 'windows') {
    return { section: 'windows' };
  }
  if (raw === 'organize') {
    return { section: 'organize' };
  }
  if (raw === 'providers') {
    return { section: 'providers' };
  }
  if (raw === 'rules') {
    return { section: 'rules' };
  }
  if (raw === 'trash') {
    return { section: 'trash' };
  }
  if (raw === 'settings' || raw === 'preferences') {
    return { section: 'settings' };
  }
  if (raw.startsWith('collection/')) {
    const id = raw.slice('collection/'.length).trim();
    if (id) {
      return { section: 'collection', collectionId: id };
    }
  }
  return { section: 'home' };
}

export function buildHash(route: RouteState): string {
  if (route.section === 'collection' && route.collectionId) {
    return `#/collection/${route.collectionId}`;
  }
  if (route.section === 'home') {
    return '#/home';
  }
  return `#/${route.section}`;
}

export function useHashRoute(): [
  RouteState,
  (next: RouteState | ((curr: RouteState) => RouteState)) => void,
] {
  const [route, setRoute] = useState<RouteState>(() => {
    if (typeof window !== 'undefined') {
      return parseHash(window.location.hash);
    }
    return { section: 'home' };
  });

  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseHash(window.location.hash);
      setRoute(parsed);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback(
    (next: RouteState | ((curr: RouteState) => RouteState)) => {
      setRoute((curr) => {
        const resolved = typeof next === 'function' ? next(curr) : next;
        const newHash = buildHash(resolved);
        if (window.location.hash !== newHash) {
          window.location.hash = newHash;
        }
        return resolved;
      });
    },
    [],
  );

  return [route, navigate];
}
