import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import {
  exportCorrectionsJsonl,
  recordCorrection,
} from '../../../src/corrections';
import { TabmanDatabase } from '../../../src/database';
import type { OrganizeProposal } from '../../../src/messages';
import { sendSwitchboardRequest } from '../../../src/runtime';
import { hostInitial, hostLabel } from '../../../src/ui/format';
import {
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  DownloadIcon,
  FolderIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  SparkIcon,
} from '../../../src/ui/icons';
import type { PanelProps } from '../types';

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
  const [excludedTabIds, setExcludedTabIds] = useState<Set<string>>(new Set());
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
      setExcludedTabIds(new Set());
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

  const toggleTabApproval = (tabId: string) => {
    setExcludedTabIds((curr) => {
      const next = new Set(curr);
      if (next.has(tabId)) {
        next.delete(tabId);
      } else {
        next.add(tabId);
      }
      return next;
    });
  };

  const approveAll = () => {
    setExcludedTabIds(new Set());
  };

  const rejectAll = () => {
    setProposal(undefined);
    setExcludedTabIds(new Set());
  };

  const handleExportTrainingData = async () => {
    try {
      const db = new TabmanDatabase();
      const jsonl = await exportCorrectionsJsonl(db);
      if (!jsonl.trim()) {
        onNotify(
          'No training feedback recorded yet. Organizing and approving tabs creates training signal!',
          'info',
        );
        return;
      }
      const blob = new Blob([jsonl], { type: 'application/x-jsonlines' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tabman_corrections_${Date.now()}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify('Exported training feedback JSONL successfully!', 'success');
    } catch {
      onNotify('Failed to export training data', 'danger');
    }
  };

  const apply = async () => {
    if (!proposal || busy) {
      return;
    }
    const activeItems = proposal.items.filter(
      (item) => !excludedTabIds.has(item.tabId),
    );
    if (activeItems.length === 0) {
      onNotify('No tabs selected in proposal', 'danger');
      return;
    }

    setBusy(true);
    try {
      const effectiveProposal: OrganizeProposal =
        destinationMode === 'single'
          ? {
              ...proposal,
              items: activeItems.map((item) => ({
                ...item,
                collectionName: `Organized Tabs (${new Date().toLocaleDateString()})`,
                tags: item.collectionName
                  ? [...new Set([...item.tags, item.collectionName])]
                  : item.tags,
              })),
            }
          : { ...proposal, items: activeItems };

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

      // Record human-in-the-loop corrections to IndexedDB for continuous kNN learning!
      try {
        const db = new TabmanDatabase();
        for (const item of activeItems) {
          void recordCorrection(db, {
            url: item.url || '',
            title: item.title || '',
            hostname: item.hostname || '',
            collectionName: item.collectionName,
            tags: item.tags || [],
            action: 'approve',
          });
        }
      } catch {
        // non-blocking
      }

      onNotify(
        `${response.applied.tabs} tabs saved in ${response.applied.collections} collections.`,
        'success',
      );
      setProposal(undefined);
      setExcludedTabIds(new Set());
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
              <strong>
                {proposal.items.length - excludedTabIds.size} of{' '}
                {proposal.items.length} tabs
              </strong>
              <span>
                organized by <em>{proposal.provider}</em> into {groups.size}{' '}
                {destinationMode === 'single' ? 'tags' : 'collections'}
                {excludedTabIds.size > 0 &&
                  ` (${excludedTabIds.size} excluded)`}
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
                onClick={handleExportTrainingData}
                title="Export human-in-the-loop corrections as JSONL for GPU training"
              >
                <DownloadIcon size={14} />
                Export Training Data
              </button>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={approveAll}
                title="Approve and include all tabs"
              >
                Approve all
              </button>
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
                disabled={
                  busy ||
                  proposal.items.length === 0 ||
                  proposal.items.length === excludedTabIds.size
                }
                onClick={() => void apply()}
              >
                <CheckIcon size={15} />
                Save {proposal.items.length - excludedTabIds.size} tabs
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={rejectAll}
              >
                Reject all
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
                        const isExcluded = excludedTabIds.has(item.tabId);
                        return (
                          // biome-ignore lint/a11y/noStaticElementInteractions: Kanban card draggable element
                          <div
                            className={`kanban-card ${
                              isBefore ? 'drop-before' : ''
                            } ${isAfter ? 'drop-after' : ''} ${
                              draggingTabId === item.tabId ? 'is-dragging' : ''
                            } ${isExcluded ? 'is-excluded' : ''}`}
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
                              {/* biome-ignore lint/a11y/useKeyWithClickEvents: Card checkbox click isolation */}
                              <label
                                className="kanban-card-check"
                                title={
                                  isExcluded
                                    ? 'Excluded from organization (click to approve)'
                                    : 'Approved for organization (click to exclude)'
                                }
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={!isExcluded}
                                  onChange={() => toggleTabApproval(item.tabId)}
                                />
                              </label>
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
