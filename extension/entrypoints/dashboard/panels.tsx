import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ApiFormat,
  ProviderProfile,
  ProviderSettings,
} from '../../src/ai';
import type { OrganizeProposal } from '../../src/messages';
import { sendSwitchboardRequest } from '../../src/runtime';
import {
  CheckIcon,
  CloseIcon,
  PlusIcon,
  ShieldIcon,
  SparkIcon,
  TrashIcon,
} from '../../src/ui/icons';

const FORMATS: { value: ApiFormat; label: string; hint: string }[] = [
  {
    value: 'responses',
    label: 'OpenAI Responses',
    hint: 'POST {base}/responses, the current OpenAI API',
  },
  {
    value: 'openai',
    label: 'OpenAI compatible',
    hint: 'POST {base}/chat/completions, for OpenRouter, Ollama, vLLM and friends',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    hint: 'POST {base}/v1/messages',
  },
];

export interface PanelProps {
  onNotify: (message: string, tone?: 'info' | 'success' | 'danger') => void;
}

export function ProvidersPanel({ onNotify }: PanelProps) {
  const [settings, setSettings] = useState<ProviderSettings>();
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiFormat, setApiFormat] = useState<ApiFormat>('responses');
  const [keyDraft, setKeyDraft] = useState('');
  const [remember, setRemember] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) {
      nameInput.current?.focus();
    }
  }, [adding]);

  const load = useCallback(async () => {
    const response = await sendSwitchboardRequest({ type: 'providers/get' });
    if (!response.ok) {
      onNotify(response.error, 'danger');
      return;
    }
    if (!('settings' in response)) {
      return;
    }
    setSettings(response.settings);
    setHasKey(response.hasKey);
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<void>, message: string) => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await work();
      onNotify(message, 'success');
      await load();
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : 'The provider action failed',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  const addProvider = () =>
    run(async () => {
      const profile: ProviderProfile = {
        id: crypto.randomUUID(),
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiFormat,
      };
      const response = await sendSwitchboardRequest({
        type: 'providers/save',
        profile,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      setName('');
      setBaseUrl('');
      setModel('');
      setAdding(false);
    }, 'Provider saved.');

  const saveKey = () =>
    run(async () => {
      const response = await sendSwitchboardRequest({
        type: 'providers/set-key',
        key: keyDraft,
        remember,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      setKeyDraft('');
    }, 'API key stored.');

  const providers = settings?.providers ?? [];

  return (
    <section className="providers">
      <header className="settings-head">
        <p className="eyebrow">Assistants</p>
        <h1>Providers</h1>
        <p className="settings-intro">
          Tabman can ask any OpenAI-compatible, Responses, or Anthropic
          compatible endpoint to group your open tabs. Keys stay in this browser
          and are never sent anywhere except the provider you pick.
        </p>
      </header>

      <div className="provider-list">
        {providers.length === 0 && !adding && (
          <div className="empty">
            <span className="empty-mark" aria-hidden="true">
              <SparkIcon size={22} />
            </span>
            <h2>No provider yet</h2>
            <p>
              Add one to enable the organizer, or use the local grouping rules
              which never leave this machine.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setAdding(true)}
            >
              <PlusIcon size={15} />
              Add a provider
            </button>
          </div>
        )}

        {providers.map((profile) => {
          const active = profile.id === settings?.activeProviderId;
          return (
            <article
              className={active ? 'provider active' : 'provider'}
              key={profile.id}
            >
              <header className="provider-head">
                <div>
                  <strong>{profile.name}</strong>
                  <span>
                    {profile.model} · {profile.apiFormat}
                  </span>
                  <code>{profile.baseUrl}</code>
                </div>
                {active ? (
                  <span className="chip chip-brand">
                    <CheckIcon size={13} />
                    In use
                  </span>
                ) : (
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const response = await sendSwitchboardRequest({
                          type: 'providers/activate',
                          id: profile.id,
                        });
                        if (!response.ok) {
                          throw new Error(response.error);
                        }
                      }, `${profile.name} is now the active provider.`)
                    }
                  >
                    Use
                  </button>
                )}
              </header>

              <div className="provider-key">
                <span
                  className={
                    hasKey && active ? 'chip chip-success' : 'chip chip-warning'
                  }
                >
                  {hasKey && active ? 'Key ready' : 'No key stored'}
                </span>
                <input
                  className="input"
                  type="password"
                  placeholder="Paste the API key"
                  autoComplete="off"
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                />
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={busy || !keyDraft.trim()}
                  onClick={() => void saveKey()}
                >
                  Save key
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  type="button"
                  title="Forget the stored key"
                  aria-label="Forget the stored key"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const response = await sendSwitchboardRequest({
                        type: 'providers/forget-key',
                      });
                      if (!response.ok) {
                        throw new Error(response.error);
                      }
                    }, 'The API key was forgotten.')
                  }
                >
                  <CloseIcon size={14} />
                </button>
              </div>

              <label className="settings-toggle provider-remember">
                <span>Remember the key on this device</span>
                <input
                  className="switch"
                  type="checkbox"
                  role="switch"
                  aria-checked={remember}
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
              </label>

              <footer className="provider-foot">
                <span>
                  <ShieldIcon size={13} />
                  Session only unless you turn the switch on.
                </span>
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const response = await sendSwitchboardRequest({
                        type: 'providers/remove',
                        id: profile.id,
                      });
                      if (!response.ok) {
                        throw new Error(response.error);
                      }
                    }, `${profile.name} was removed.`)
                  }
                >
                  <TrashIcon size={14} />
                  Remove
                </button>
              </footer>
            </article>
          );
        })}

        {adding && (
          <form
            className="provider provider-new"
            onSubmit={(event) => {
              event.preventDefault();
              void addProvider();
            }}
          >
            <div className="provider-grid">
              <label>
                Display name
                <input
                  ref={nameInput}
                  className="input"
                  maxLength={120}
                  placeholder="My Gateway"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                Base URL
                <input
                  className="input"
                  maxLength={2048}
                  placeholder="https://api.openai.com/v1"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </label>
              <label>
                Model
                <input
                  className="input"
                  maxLength={200}
                  placeholder="gpt-6-luna"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </label>
              <label>
                Format
                <select
                  className="select"
                  value={apiFormat}
                  onChange={(event) =>
                    setApiFormat(event.target.value as ApiFormat)
                  }
                >
                  {FORMATS.map((format) => (
                    <option value={format.value} key={format.value}>
                      {format.label}
                    </option>
                  ))}
                </select>
                <small>
                  {FORMATS.find((format) => format.value === apiFormat)?.hint}
                </small>
              </label>
            </div>
            <div className="provider-actions">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={
                  busy || !name.trim() || !baseUrl.trim() || !model.trim()
                }
              >
                <PlusIcon size={15} />
                Add provider
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {providers.length > 0 && !adding && (
          <button className="btn" type="button" onClick={() => setAdding(true)}>
            <PlusIcon size={15} />
            Add a provider
          </button>
        )}
      </div>
    </section>
  );
}

export interface OrganizePanelProps extends PanelProps {
  onApplied: () => void;
}

export function OrganizePanel({ onNotify, onApplied }: OrganizePanelProps) {
  const [proposal, setProposal] = useState<OrganizeProposal>();
  const [busy, setBusy] = useState(false);

  const preview = async (mode: 'provider' | 'deterministic') => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const response = await sendSwitchboardRequest({
        type: 'library/organize',
        mode,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (!('proposal' in response)) {
        throw new Error('The organizer did not return a proposal');
      }
      setProposal(response.proposal);
      onNotify(
        `${response.proposal.items.length} tabs grouped by ${response.proposal.provider}.`,
        'success',
      );
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : 'The organizer failed',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!proposal || busy) {
      return;
    }
    setBusy(true);
    try {
      const response = await sendSwitchboardRequest({
        type: 'library/organize/apply',
        proposal,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (!('applied' in response)) {
        throw new Error('The proposal was not applied');
      }
      onNotify(
        `${response.applied.tabs} tabs saved in ${response.applied.collections} collections.`,
        'success',
      );
      setProposal(undefined);
      onApplied();
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : 'The proposal failed',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  const groups = new Map<string, OrganizeProposal['items']>();
  for (const item of proposal?.items ?? []) {
    const bucket = groups.get(item.collectionName);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(item.collectionName, [item]);
    }
  }

  return (
    <section className="organize">
      <header className="settings-head">
        <p className="eyebrow">Assistant</p>
        <h1>Organize the open tabs</h1>
        <p className="settings-intro">
          Tabman collects the open tabs, asks your provider for one collection
          per tab, and shows the result before anything is saved. Nothing is
          written until you apply it.
        </p>
      </header>

      <div className="organize-actions">
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={() => void preview('provider')}
        >
          <SparkIcon size={15} />
          Preview with the provider
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => void preview('deterministic')}
        >
          Preview with local rules
        </button>
      </div>

      {proposal && (
        <div className="proposal">
          <header className="proposal-head">
            <div>
              <strong>{proposal.items.length} tabs</strong>
              <span>
                grouped by {proposal.provider} into {groups.size} collections
              </span>
            </div>
            <div className="proposal-actions">
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => void apply()}
              >
                <CheckIcon size={15} />
                Save to the library
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setProposal(undefined)}
              >
                Discard
              </button>
            </div>
          </header>

          <div className="proposal-groups">
            {[...groups.entries()].map(([name, items]) => (
              <article className="proposal-group" key={name}>
                <header>
                  <strong>{name}</strong>
                  <span>{items.length} tabs</span>
                </header>
                <ul>
                  {items.map((item) => (
                    <li key={item.tabId}>
                      <span className="proposal-title">
                        {item.title || item.url}
                      </span>
                      <span className="proposal-host">{item.hostname}</span>
                      {item.tags.length > 0 && (
                        <span className="proposal-tags">
                          {item.tags.map((tag) => (
                            <span className="chip" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      )}

      {!proposal && !busy && (
        <div className="empty">
          <span className="empty-mark" aria-hidden="true">
            <SparkIcon size={22} />
          </span>
          <h2>No preview yet</h2>
          <p>
            Start with the provider you configured, or preview the local rules
            that group tabs by hostname without any network call.
          </p>
        </div>
      )}
    </section>
  );
}
