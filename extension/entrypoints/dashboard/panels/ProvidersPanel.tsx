import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApiFormat,
  ProviderProfile,
  ProviderSettings,
} from '../../../src/ai';
import { sendSwitchboardRequest } from '../../../src/runtime';
import {
  CheckIcon,
  CloseIcon,
  PlusIcon,
  ShieldIcon,
  SparkIcon,
  TrashIcon,
} from '../../../src/ui/icons';
import type { PanelProps } from '../types';

const FORMATS: { value: ApiFormat; label: string; hint: string }[] = [
  {
    value: 'ollama',
    label: 'Ollama (Localhost)',
    hint: 'POST {base}/api/chat, local models (no API key needed)',
  },
  {
    value: 'responses',
    label: 'OpenAI Responses',
    hint: 'POST {base}/responses, the current OpenAI API',
  },
  {
    value: 'openai',
    label: 'OpenAI compatible',
    hint: 'POST {base}/chat/completions, for OpenRouter, vLLM and friends',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    hint: 'POST {base}/v1/messages',
  },
];

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
