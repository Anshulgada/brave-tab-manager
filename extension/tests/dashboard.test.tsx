/**
 * @vitest-environment jsdom
 *
 * The dashboard and the side panel are React surfaces, so these tests render
 * them with a stubbed extension API and drive the real interactions.
 */

import 'fake-indexeddb/auto';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../entrypoints/dashboard/App';

interface StoredMessage {
  type: string;
  [key: string]: unknown;
}

function installBrowserMock(responses: Record<string, unknown> = {}) {
  const sent: StoredMessage[] = [];
  const mock = {
    runtime: {
      id: 'tabman-test',
      sendMessage: vi.fn(async (message: StoredMessage) => {
        sent.push(message);
        const answer = responses[message.type];
        if (answer !== undefined) {
          return answer;
        }
        return { ok: true };
      }),
      getURL: vi.fn((path: string) => `chrome-extension://tabman${path}`),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
        hasListener: vi.fn(() => false),
      },
      onInstalled: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
      session: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
    tabs: {
      query: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 1 })),
      get: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    },
    windows: { getAll: vi.fn(async () => []) },
    permissions: {
      contains: vi.fn(async () => true),
      request: vi.fn(async () => true),
    },
  };
  (globalThis as unknown as { browser: typeof mock }).browser = mock;
  return { mock, sent };
}

describe('the dashboard', () => {
  beforeEach(() => {
    installBrowserMock();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the welcome state for an empty library', async () => {
    render(<App />);

    expect(
      await screen.findByText('Your tab library starts here'),
    ).toBeTruthy();
  });

  it('opens the provider panel from the rail', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Providers/ }));

    expect(await screen.findByText('No provider yet')).toBeTruthy();
  });

  it('opens the organizer from the rail', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /Organize/ }));

    expect(
      await screen.findByRole('heading', { name: 'Organize the open tabs' }),
    ).toBeTruthy();
  });

  it('offers the collect action on the empty home', async () => {
    render(<App />);

    const collect = await screen.findAllByRole('button', {
      name: /Collect every open tab/,
    });

    expect(collect.length).toBeGreaterThan(0);
  });

  it('collects without asking for a name', async () => {
    installBrowserMock({
      'library/collect': {
        ok: true,
        affected: 3,
        collectionId: 'col-1',
        collectionName: 'Collected 10/21/2026',
      },
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      (
        await screen.findAllByRole('button', { name: /Collect every open tab/ })
      )[0] ??
        (() => {
          throw new Error('the collect button is missing');
        })(),
    );

    expect(await screen.findByText(/3 open tabs collected/)).toBeTruthy();
  });
});

describe('the provider panel', () => {
  afterEach(() => {
    cleanup();
  });

  it('saves a provider profile', async () => {
    const { sent } = installBrowserMock({
      'providers/get': {
        ok: true,
        settings: { providers: [], activeProviderId: null, rememberKey: false },
        hasKey: false,
      },
    });
    const user = userEvent.setup();
    const { ProvidersPanel } = await import('../entrypoints/dashboard/panels');
    render(<ProvidersPanel onNotify={() => undefined} />);

    await user.click(
      await screen.findByRole('button', { name: /Add a provider/ }),
    );
    await user.type(screen.getByLabelText('Display name'), 'Gateway');
    await user.type(
      screen.getByLabelText('Base URL'),
      'https://api.example/v1',
    );
    await user.type(screen.getByLabelText('Model'), 'gpt-6-luna');
    await user.click(screen.getByRole('button', { name: /Add provider/ }));

    await waitFor(() => {
      expect(sent.some((message) => message.type === 'providers/save')).toBe(
        true,
      );
    });
  });
});
