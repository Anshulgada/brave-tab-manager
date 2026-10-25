import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ApiFormat,
  ProviderProfile,
  ProviderSettings,
} from '../../src/ai';
import type {
  OrganizeProposal,
  SwitchboardChangedMessage,
} from '../../src/messages';
import { sendSwitchboardRequest } from '../../src/runtime';
import {
  filterSwitchboard,
  type SwitchboardSnapshot,
  type SwitchboardTab,
} from '../../src/switchboard';
import {
  hostInitial,
  hostLabel,
  pluralize,
  tabLabel,
} from '../../src/ui/format';
import {
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  FolderIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
  TrashIcon,
  WindowIcon,
  ZapIcon,
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
  rules?: string;
  onApplied: () => void;
}

export function OrganizePanel({
  rules,
  onNotify,
  onApplied,
}: OrganizePanelProps) {
  const [proposal, setProposal] = useState<OrganizeProposal>();
  const [busy, setBusy] = useState(false);
  const [destinationMode, setDestinationMode] = useState<'multiple' | 'single'>(
    () => {
      try {
        return (
          (localStorage.getItem('tabman-organize-mode') as
            | 'multiple'
            | 'single') || 'multiple'
        );
      } catch {
        return 'multiple';
      }
    },
  );
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [draggingTabId, setDraggingTabId] = useState<string>();
  const [dropTargetGroup, setDropTargetGroup] = useState<string>();
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(
    null,
  );
  const [interDropIndex, setInterDropIndex] = useState<number | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editGroupNameValue, setEditGroupNameValue] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [organizeView, setOrganizeView] = useState<'board' | 'grid'>('board');
  const boardRef = useRef<HTMLDivElement>(null);

  const [editingTabItem, setEditingTabItem] = useState<
    OrganizeProposal['items'][number] | null
  >(null);
  const [editTabTitle, setEditTabTitle] = useState('');
  const [editTabUrl, setEditTabUrl] = useState('');
  const [editTabGroup, setEditTabGroup] = useState('');
  const [showModalNewGroupInput, setShowModalNewGroupInput] = useState(false);
  const [modalNewGroupName, setModalNewGroupName] = useState('');

  const handleBoardDragOver = (e: React.DragEvent) => {
    if (!boardRef.current || organizeView !== 'board' || !draggingTabId) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const threshold = 70;
    if (x < threshold) {
      boardRef.current.scrollLeft -= 14;
    } else if (rect.width - x < threshold) {
      boardRef.current.scrollLeft += 14;
    }
  };

  const preview = async (mode: 'provider' | 'deterministic') => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const response = await sendSwitchboardRequest({
        type: 'library/organize',
        mode,
        rules: mode === 'deterministic' ? rules : undefined,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if (!('proposal' in response)) {
        throw new Error('The organizer did not return a proposal');
      }
      setProposal(response.proposal);
      setCustomGroups([]);
      setCollapsedGroups(new Set());
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
      const effectiveProposal: OrganizeProposal =
        destinationMode === 'single'
          ? {
              ...proposal,
              items: proposal.items.map((item) => ({
                ...item,
                collectionName: `Organized Tabs (${new Date().toLocaleDateString()})`,
                tags: item.collectionName
                  ? [...new Set([...item.tags, item.collectionName])]
                  : item.tags,
              })),
            }
          : proposal;

      const response = await sendSwitchboardRequest({
        type: 'library/organize/apply',
        proposal: effectiveProposal,
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

  const moveTab = (tabId: string, targetGroup: string) => {
    setProposal((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        items: curr.items.map((item) =>
          item.tabId === tabId
            ? { ...item, collectionName: targetGroup }
            : item,
        ),
      };
    });
  };

  const reorderTab = (
    draggedId: string,
    targetId: string,
    targetGroup: string,
    position: 'before' | 'after',
  ) => {
    setProposal((curr) => {
      if (!curr) return curr;
      const draggedItem = curr.items.find((it) => it.tabId === draggedId);
      if (!draggedItem) return curr;
      const otherItems = curr.items.filter((it) => it.tabId !== draggedId);
      const targetIndex = otherItems.findIndex((it) => it.tabId === targetId);
      const updatedDragged = { ...draggedItem, collectionName: targetGroup };
      if (targetIndex === -1) {
        return {
          ...curr,
          items: [...otherItems, updatedDragged],
        };
      }
      const insertAt = position === 'before' ? targetIndex : targetIndex + 1;
      const newItems = [...otherItems];
      newItems.splice(insertAt, 0, updatedDragged);
      return {
        ...curr,
        items: newItems,
      };
    });
  };

  const removeTab = (tabId: string) => {
    setProposal((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        items: curr.items.filter((item) => item.tabId !== tabId),
      };
    });
  };

  const startRenamingGroup = (groupName: string) => {
    setEditingGroup(groupName);
    setEditGroupNameValue(groupName);
  };

  const finishRenamingGroup = (oldName: string) => {
    const trimmed = editGroupNameValue.trim();
    setEditingGroup(null);
    if (!trimmed || trimmed === oldName) {
      return;
    }
    setProposal((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        items: curr.items.map((item) =>
          item.collectionName === oldName
            ? { ...item, collectionName: trimmed }
            : item,
        ),
      };
    });
    setCustomGroups((curr) =>
      curr.map((name) => (name === oldName ? trimmed : name)),
    );
    setCollapsedGroups((curr) => {
      if (!curr.has(oldName)) return curr;
      const next = new Set(curr);
      next.delete(oldName);
      next.add(trimmed);
      return next;
    });
  };

  const addGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setCustomGroups((curr) =>
      curr.includes(trimmed) ? curr : [...curr, trimmed],
    );
    setNewGroupName('');
    setShowAddGroup(false);
  };

  const toggleCollapse = (name: string) => {
    setCollapsedGroups((curr) => {
      const next = new Set(curr);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const groups = new Map<string, OrganizeProposal['items']>();
  for (const name of customGroups) {
    groups.set(name, []);
  }
  for (const item of proposal?.items ?? []) {
    const bucket = groups.get(item.collectionName);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(item.collectionName, [item]);
    }
  }

  const getNextNewGroupName = (existing: Set<string>): string => {
    const base = 'New Group';
    if (!existing.has(base)) return base;
    let counter = 2;
    while (existing.has(`${base} (${counter})`)) {
      counter++;
    }
    return `${base} (${counter})`;
  };

  const createGroupAndMove = (tabId: string, atIndex: number) => {
    const existingNames = new Set(groups.keys());
    const newName = getNextNewGroupName(existingNames);
    const groupKeys = Array.from(groups.keys());
    const nextCustom = [...groupKeys];
    nextCustom.splice(atIndex, 0, newName);
    setCustomGroups(nextCustom);

    setProposal((curr) => {
      if (!curr) return curr;
      return {
        ...curr,
        items: curr.items.map((it) =>
          it.tabId === tabId ? { ...it, collectionName: newName } : it,
        ),
      };
    });
    setEditingGroup(newName);
    setEditGroupNameValue(newName);
  };

  const allCollapsed = groups.size > 0 && collapsedGroups.size === groups.size;

  return (
    <section className="organize">
      <header className="settings-head">
        <p className="eyebrow">Assistant</p>
        <h1>Organize the open tabs</h1>
        <p className="settings-intro">
          Tabman collects the open tabs, organizes them with local pattern rules
          or an AI provider, and previews the result in an interactive Kanban
          board. Drag cards to move tabs between collections before saving!
        </p>
      </header>

      <div className="organize-toolbar">
        <div className="organize-toolbar-left">
          <span className="organize-mode-label">Destination:</span>
          <div className="segmented-pill-track">
            <button
              type="button"
              className={`segmented-pill-btn ${
                destinationMode === 'multiple' ? 'active' : ''
              }`}
              onClick={() => {
                setDestinationMode('multiple');
                try {
                  localStorage.setItem('tabman-organize-mode', 'multiple');
                } catch {}
              }}
            >
              {destinationMode === 'multiple' && (
                <motion.div
                  layoutId="destPill"
                  className="segmented-pill-slider"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="segmented-pill-text">Separate collections</span>
            </button>
            <button
              type="button"
              className={`segmented-pill-btn ${
                destinationMode === 'single' ? 'active' : ''
              }`}
              onClick={() => {
                setDestinationMode('single');
                try {
                  localStorage.setItem('tabman-organize-mode', 'single');
                } catch {}
              }}
            >
              {destinationMode === 'single' && (
                <motion.div
                  layoutId="destPill"
                  className="segmented-pill-slider"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="segmented-pill-text">
                Single collection (with tags)
              </span>
            </button>
          </div>
        </div>

        <div className="organize-toolbar-right">
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() => void preview('provider')}
          >
            <SparkIcon size={15} />
            Preview with provider
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void preview('deterministic')}
          >
            <LayersIcon size={15} />
            Preview with local rules
          </button>
        </div>
      </div>

      {proposal && (
        <motion.div
          className="proposal"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <header className="proposal-head">
            <div className="proposal-meta">
              <strong>{proposal.items.length} tabs</strong>
              <span>
                organized by <em>{proposal.provider}</em> into {groups.size}{' '}
                {destinationMode === 'single' ? 'tags' : 'collections'}
              </span>
            </div>
            <div className="proposal-toolbar">
              <div className="segmented-pill-track">
                <button
                  type="button"
                  className={`segmented-pill-btn ${
                    organizeView === 'board' ? 'active' : ''
                  }`}
                  onClick={() => setOrganizeView('board')}
                  aria-label="Board view"
                >
                  {organizeView === 'board' && (
                    <motion.div
                      layoutId="organizeViewPill"
                      className="segmented-pill-slider"
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span className="segmented-pill-text">Board</span>
                </button>
                <button
                  type="button"
                  className={`segmented-pill-btn ${
                    organizeView === 'grid' ? 'active' : ''
                  }`}
                  onClick={() => setOrganizeView('grid')}
                  aria-label="Grid view"
                >
                  {organizeView === 'grid' && (
                    <motion.div
                      layoutId="organizeViewPill"
                      className="segmented-pill-slider"
                      transition={{
                        type: 'spring',
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <span className="segmented-pill-text">Grid</span>
                </button>
              </div>

              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => {
                  if (allCollapsed) {
                    setCollapsedGroups(new Set());
                  } else {
                    setCollapsedGroups(new Set(groups.keys()));
                  }
                }}
              >
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </button>
              {showAddGroup ? (
                <div className="kanban-add-group-form">
                  <input
                    className="input input-sm"
                    placeholder="New column name..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addGroup();
                      if (e.key === 'Escape') setShowAddGroup(false);
                    }}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    type="button"
                    onClick={addGroup}
                  >
                    Add
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => setShowAddGroup(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => setShowAddGroup(true)}
                >
                  <PlusIcon size={14} />
                  New group
                </button>
              )}
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || proposal.items.length === 0}
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

          <section
            className={`kanban-board ${
              organizeView === 'grid' ? 'kanban-grid-mode' : ''
            }`}
            ref={boardRef}
            aria-label="Organize Kanban Board"
            onDragOver={handleBoardDragOver}
          >
            {[...groups.entries()].flatMap(([name, items], idx, allEntries) => {
              const isCollapsed = collapsedGroups.has(name);
              const isDropTarget = dropTargetGroup === name;

              const dropzoneBefore = (
                // biome-ignore lint/a11y/noStaticElementInteractions: Kanban inter-column dropzone
                <div
                  key={`dropzone-before-${name}`}
                  className={`kanban-inter-dropzone ${
                    interDropIndex === idx ? 'is-active' : ''
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setInterDropIndex(idx);
                  }}
                  onDragLeave={() => {
                    if (interDropIndex === idx) setInterDropIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingTabId) {
                      createGroupAndMove(draggingTabId, idx);
                    }
                    setInterDropIndex(null);
                    setDraggingTabId(undefined);
                  }}
                >
                  <div className="kanban-inter-dropzone-indicator">
                    <PlusIcon size={12} />
                    <span>New group</span>
                  </div>
                </div>
              );

              const columnElement = (
                // biome-ignore lint/a11y/noStaticElementInteractions: Kanban board column drop target
                <div
                  className={`kanban-col${
                    isCollapsed ? ' is-collapsed' : ''
                  }${isDropTarget ? ' is-drop-target' : ''}`}
                  key={name}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTargetGroup(name);
                  }}
                  onDragLeave={() => setDropTargetGroup(undefined)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingTabId) {
                      moveTab(draggingTabId, name);
                    }
                    setDropTargetGroup(undefined);
                    setDraggingTabId(undefined);
                  }}
                >
                  <header className="kanban-col-head">
                    <div className="kanban-col-title">
                      <span className="kanban-col-icon" aria-hidden="true">
                        <FolderIcon size={15} />
                      </span>
                      {editingGroup === name ? (
                        <input
                          ref={(el) => el?.focus()}
                          className="input input-sm kanban-rename-input"
                          value={editGroupNameValue}
                          onChange={(e) =>
                            setEditGroupNameValue(e.target.value)
                          }
                          onBlur={() => finishRenamingGroup(name)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') finishRenamingGroup(name);
                            if (e.key === 'Escape') setEditingGroup(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          {/* biome-ignore lint/a11y/useKeyWithClickEvents: inline rename triggering */}
                          <strong
                            className="kanban-col-name"
                            onClick={() => startRenamingGroup(name)}
                            title="Click to rename group"
                          >
                            {name}
                          </strong>
                          <button
                            className="btn btn-ghost btn-icon btn-xs kanban-rename-btn"
                            type="button"
                            title="Rename group"
                            onClick={() => startRenamingGroup(name)}
                          >
                            <PencilIcon size={11} />
                          </button>
                        </>
                      )}
                      <span className="badge">{items.length}</span>
                    </div>
                    <button
                      className={`btn btn-ghost btn-icon btn-sm kanban-col-toggle ${
                        isCollapsed ? 'collapsed' : ''
                      }`}
                      type="button"
                      title={
                        isCollapsed
                          ? `Expand group (${items.length} tabs)`
                          : 'Collapse group'
                      }
                      aria-label={
                        isCollapsed ? `Expand ${name}` : `Collapse ${name}`
                      }
                      onClick={() => toggleCollapse(name)}
                    >
                      <ChevronDownIcon size={14} />
                    </button>
                  </header>

                  {!isCollapsed && (
                    <div className="kanban-col-cards">
                      {items.map((item) => {
                        const isOver = dragOverTabId === item.tabId;
                        const isBefore = isOver && dropPosition === 'before';
                        const isAfter = isOver && dropPosition === 'after';
                        return (
                          // biome-ignore lint/a11y/noStaticElementInteractions: Kanban card draggable element
                          <div
                            className={`kanban-card ${
                              isBefore ? 'drop-before' : ''
                            } ${isAfter ? 'drop-after' : ''} ${
                              draggingTabId === item.tabId ? 'is-dragging' : ''
                            }`}
                            key={item.tabId}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', item.tabId);
                              setDraggingTabId(item.tabId);
                            }}
                            onDragEnd={() => {
                              setDraggingTabId(undefined);
                              setDropTargetGroup(undefined);
                              setDragOverTabId(null);
                              setDropPosition(null);
                              setInterDropIndex(null);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDropTargetGroup(name);
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const midY = rect.top + rect.height / 2;
                              const pos = e.clientY < midY ? 'before' : 'after';
                              setDragOverTabId(item.tabId);
                              setDropPosition(pos);
                            }}
                            onDragLeave={() => {
                              if (dragOverTabId === item.tabId) {
                                setDragOverTabId(null);
                                setDropPosition(null);
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (
                                draggingTabId &&
                                draggingTabId !== item.tabId
                              ) {
                                reorderTab(
                                  draggingTabId,
                                  item.tabId,
                                  name,
                                  dropPosition ?? 'before',
                                );
                              } else if (draggingTabId) {
                                moveTab(draggingTabId, name);
                              }
                              setDragOverTabId(null);
                              setDropPosition(null);
                              setDraggingTabId(undefined);
                              setDropTargetGroup(undefined);
                            }}
                          >
                            <div className="kanban-card-main">
                              <span
                                className="tab-favicon fallback"
                                aria-hidden="true"
                              >
                                {hostInitial(item.hostname, item.url)}
                              </span>
                              <div className="kanban-card-text">
                                <span
                                  className="kanban-card-title"
                                  title={item.title || item.url}
                                >
                                  {item.title || item.url}
                                </span>
                                <span className="kanban-card-host">
                                  {hostLabel(item.hostname, item.url)}
                                </span>
                              </div>
                              <div className="kanban-card-actions">
                                <button
                                  className="btn btn-ghost btn-icon btn-sm kanban-card-edit"
                                  type="button"
                                  title="Edit tab & group"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTabItem(item);
                                    setEditTabTitle(item.title || '');
                                    setEditTabUrl(item.url || '');
                                    setEditTabGroup(item.collectionName);
                                    setShowModalNewGroupInput(false);
                                    setModalNewGroupName('');
                                  }}
                                >
                                  <PencilIcon size={12} />
                                </button>
                                <button
                                  className="btn btn-ghost btn-icon btn-sm kanban-card-remove"
                                  type="button"
                                  title="Remove tab from preview"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeTab(item.tabId);
                                  }}
                                >
                                  <CloseIcon size={12} />
                                </button>
                              </div>
                            </div>
                            {item.tags.length > 0 && (
                              <div className="kanban-card-tags">
                                {item.tags.map((tag) => (
                                  <span className="chip chip-xs" key={tag}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {items.length === 0 && (
                        <div className="kanban-empty-drop">Drop tabs here</div>
                      )}
                    </div>
                  )}
                </div>
              );

              const isLast = idx === allEntries.length - 1;
              if (isLast) {
                const dropzoneAfter = (
                  // biome-ignore lint/a11y/noStaticElementInteractions: Kanban inter-column dropzone
                  <div
                    key="dropzone-after-end"
                    className={`kanban-inter-dropzone ${
                      interDropIndex === idx + 1 ? 'is-active' : ''
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setInterDropIndex(idx + 1);
                    }}
                    onDragLeave={() => {
                      if (interDropIndex === idx + 1) setInterDropIndex(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingTabId) {
                        createGroupAndMove(draggingTabId, idx + 1);
                      }
                      setInterDropIndex(null);
                      setDraggingTabId(undefined);
                    }}
                  >
                    <div className="kanban-inter-dropzone-indicator">
                      <PlusIcon size={12} />
                      <span>New group</span>
                    </div>
                  </div>
                );
                return [dropzoneBefore, columnElement, dropzoneAfter];
              }

              return [dropzoneBefore, columnElement];
            })}
          </section>
        </motion.div>
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

      {editingTabItem && (
        <div className="overlay">
          <button
            type="button"
            className="overlay-backdrop"
            onClick={() => setEditingTabItem(null)}
            aria-label="Close dialog"
          />
          <motion.div
            className="organize-edit-dialog"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          >
            <div className="dialog-title">
              <h2>Edit Tab in Proposal</h2>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setEditingTabItem(null)}
                aria-label="Close"
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <div className="field">
              <label htmlFor="organize-edit-title">Tab title</label>
              <input
                id="organize-edit-title"
                className="input"
                value={editTabTitle}
                onChange={(e) => setEditTabTitle(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="organize-edit-url">URL</label>
              <input
                id="organize-edit-url"
                className="input"
                value={editTabUrl}
                onChange={(e) => setEditTabUrl(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="organize-edit-group">Group Destination</label>
              <select
                id="organize-edit-group"
                className="input"
                value={showModalNewGroupInput ? '__new__' : editTabGroup}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setShowModalNewGroupInput(true);
                  } else {
                    setShowModalNewGroupInput(false);
                    setEditTabGroup(e.target.value);
                  }
                }}
              >
                {Array.from(groups.keys()).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                <option value="__new__">+ Create new group...</option>
              </select>
            </div>

            {showModalNewGroupInput && (
              <div className="field">
                <label htmlFor="modal-new-group-name">New group name</label>
                <input
                  id="modal-new-group-name"
                  className="input"
                  placeholder="e.g. Research, Projects..."
                  value={modalNewGroupName}
                  onChange={(e) => setModalNewGroupName(e.target.value)}
                />
              </div>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingTabItem(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  let targetGroup = editTabGroup;
                  if (showModalNewGroupInput && modalNewGroupName.trim()) {
                    targetGroup = modalNewGroupName.trim();
                    setCustomGroups((curr) =>
                      curr.includes(targetGroup)
                        ? curr
                        : [...curr, targetGroup],
                    );
                  }
                  setProposal((curr) => {
                    if (!curr) return curr;
                    return {
                      ...curr,
                      items: curr.items.map((it) =>
                        it.tabId === editingTabItem.tabId
                          ? {
                              ...it,
                              title: editTabTitle.trim() || it.title,
                              url: editTabUrl.trim() || it.url,
                              collectionName: targetGroup,
                            }
                          : it,
                      ),
                    };
                  });
                  setEditingTabItem(null);
                }}
              >
                Save changes
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </section>
  );
}

export function WindowsPanel({ onNotify }: PanelProps) {
  const [snapshot, setSnapshot] = useState<SwitchboardSnapshot>();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/get',
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      if ('snapshot' in response) {
        setSnapshot(response.snapshot);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not load windows',
        'danger',
      );
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
    const listener = (msg: SwitchboardChangedMessage) => {
      if (msg.type === 'switchboard/changed') {
        void load();
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [load]);

  const filtered = useMemo(
    () => (snapshot ? filterSwitchboard(snapshot, query) : undefined),
    [query, snapshot],
  );

  const activateTab = async (tab: SwitchboardTab) => {
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/activate',
        tabId: tab.id,
        windowId: tab.windowId,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not activate tab',
        'danger',
      );
    }
  };

  const closeTab = async (tabId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/action',
        action: 'close',
        tabIds: [tabId],
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      onNotify('Tab closed', 'success');
      await load();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not close tab',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  const [parkConfirm, setParkConfirm] = useState<{
    windowId: number;
    tabIds: number[];
  }>();

  const parkWindow = async (
    windowId: number,
    tabIds: number[],
    closeTabs = true,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await sendSwitchboardRequest({
        type: 'switchboard/park',
        tabIds,
        name: `Window ${windowId}`,
        closeTabs,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      onNotify(
        closeTabs
          ? `Window ${windowId} saved and closed`
          : `Window ${windowId} saved to library`,
        'success',
      );
      await load();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Could not park window',
        'danger',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="windows-section">
      <header className="settings-head">
        <p className="eyebrow">Switchboard</p>
        <h1>Open Windows & Tabs</h1>
        <p className="settings-intro">
          View and manage open tabs segregated by browser window. Focus tabs,
          close them, or park whole windows into your library.
        </p>
      </header>

      {snapshot && (
        <div className="windows-summary">
          <span className="chip">
            <WindowIcon size={14} />
            {snapshot.windows.length}{' '}
            {pluralize(snapshot.windows.length, 'window')}
          </span>
          <span className="chip">
            <LayersIcon size={14} />
            {snapshot.tabCount} {pluralize(snapshot.tabCount, 'tab')}
          </span>
          {snapshot.duplicateCount > 0 && (
            <span className="chip chip-warning">
              <ZapIcon size={14} />
              {snapshot.duplicateCount} duplicate
              {snapshot.duplicateCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      <div className="windows-filter">
        <input
          className="input"
          type="search"
          placeholder="Filter tabs across windows..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setQuery('')}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty">
          <span className="spinner" aria-hidden="true" />
          <p>Reading open windows…</p>
        </div>
      ) : !filtered || filtered.windows.length === 0 ? (
        <div className="empty">
          <span className="empty-mark" aria-hidden="true">
            <SearchIcon size={22} />
          </span>
          <h2>{query ? 'No matching tabs found' : 'No open windows'}</h2>
          <p>
            {query
              ? 'Try a different search term.'
              : 'Open tabs in your browser to see them here.'}
          </p>
        </div>
      ) : (
        <div className="windows-list">
          {filtered.windows.map((win) => (
            <article className="window-card" key={win.id}>
              <header className="window-card-head">
                <div className="window-card-title">
                  <WindowIcon size={16} />
                  <h2>Window {win.id}</h2>
                  {win.focused && (
                    <span
                      className="current-window-badge"
                      title="Active/Focused Window"
                    >
                      <span className="current-window-dot" />
                      <span>Current window</span>
                    </span>
                  )}
                  <span className="window-tab-count">
                    {win.tabs.length} {pluralize(win.tabs.length, 'tab')}
                  </span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setParkConfirm({
                      windowId: win.id,
                      tabIds: win.tabs.map((t) => t.id),
                    })
                  }
                >
                  Park window
                </button>
              </header>

              <div className="window-card-tabs">
                {win.tabs.map((tab) => (
                  <div className="window-tab-item" key={tab.id}>
                    {tab.favIconUrl ? (
                      <img
                        className="tab-favicon"
                        src={tab.favIconUrl}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.hidden = true;
                        }}
                      />
                    ) : (
                      <span className="tab-favicon fallback" aria-hidden="true">
                        {hostInitial(tab.hostname, tab.url)}
                      </span>
                    )}

                    <button
                      className="window-tab-btn"
                      type="button"
                      title={tab.url}
                      onClick={() => void activateTab(tab)}
                    >
                      <strong className="window-tab-title">
                        {tabLabel(tab.title, tab.hostname, tab.url)}
                      </strong>
                      <span className="window-tab-host">
                        {hostLabel(tab.hostname, tab.url)}
                      </span>
                    </button>

                    <div className="window-tab-meta">
                      {tab.duplicateCount > 1 && (
                        <span
                          className="chip chip-warning chip-xs"
                          title="Duplicate tab"
                        >
                          ×{tab.duplicateCount}
                        </span>
                      )}
                      {tab.audible && (
                        <span className="chip chip-xs" title="Audio playing">
                          Audio
                        </span>
                      )}
                      {tab.discarded && (
                        <span className="chip chip-xs" title="Discarded tab">
                          Sleep
                        </span>
                      )}
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        type="button"
                        title="Close tab"
                        disabled={busy}
                        onClick={() => void closeTab(tab.id)}
                      >
                        <CloseIcon size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {parkConfirm && (
        <div className="overlay">
          <button
            className="overlay-backdrop"
            type="button"
            aria-label="Cancel"
            onClick={() => setParkConfirm(undefined)}
          />
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Park Window ${parkConfirm.windowId}`}
          >
            <h2>Park Window {parkConfirm.windowId}?</h2>
            <p>
              Save all {parkConfirm.tabIds.length}{' '}
              {pluralize(parkConfirm.tabIds.length, 'tab')} from this window
              into a collection in your library.
            </p>
            <div className="dialog-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setParkConfirm(undefined)}
              >
                Cancel
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  const target = parkConfirm;
                  setParkConfirm(undefined);
                  void parkWindow(target.windowId, target.tabIds, false);
                }}
              >
                Keep window open
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  const target = parkConfirm;
                  setParkConfirm(undefined);
                  void parkWindow(target.windowId, target.tabIds, true);
                }}
              >
                Close window
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
