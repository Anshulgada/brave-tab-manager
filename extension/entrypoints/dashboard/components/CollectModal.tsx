import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { LibraryCollection } from '../../../src/library';
import { CustomSelect } from '../../../src/ui/CustomSelect';

export interface CollectModalProps {
  isOpen: boolean;
  busy: boolean;
  name: string;
  onNameChange: (name: string) => void;
  collections?: LibraryCollection[];
  targetCollectionId?: string;
  onTargetCollectionIdChange?: (id: string | undefined) => void;
  onConfirm: (targetCollectionId?: string) => void;
  onClose: () => void;
}

export function CollectModal({
  isOpen,
  busy,
  name,
  onNameChange,
  collections = [],
  targetCollectionId,
  onTargetCollectionIdChange,
  onConfirm,
  onClose,
}: CollectModalProps) {
  const sortedCollections = useMemo(
    () => [...collections].sort((a, b) => a.name.localeCompare(b.name)),
    [collections],
  );
  const hasExisting = sortedCollections.length > 0;
  const [mode, setMode] = useState<'new' | 'existing'>(() =>
    targetCollectionId && hasExisting ? 'existing' : 'new',
  );

  if (!isOpen) return null;

  const handleModeChange = (nextMode: 'new' | 'existing') => {
    setMode(nextMode);
    if (nextMode === 'new') {
      onTargetCollectionIdChange?.(undefined);
    } else if (hasExisting && onTargetCollectionIdChange) {
      onTargetCollectionIdChange(
        targetCollectionId || sortedCollections[0]?.id,
      );
    }
  };

  return (
    <div className="overlay">
      <button
        className="overlay-backdrop"
        type="button"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Collect open tabs"
      >
        <h2>Collect open tabs</h2>
        <p className="settings-intro">
          Save open browser tabs into your Tabman library without closing them.
        </p>

        {hasExisting && (
          <div
            className="segmented-pill-track"
            style={{ width: '100%', marginBottom: '14px' }}
          >
            <button
              type="button"
              className={`segmented-pill-btn ${mode === 'new' ? 'active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => handleModeChange('new')}
            >
              {mode === 'new' && (
                <motion.div
                  layoutId="collectModalModePill"
                  className="segmented-pill-slider"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}
              <span className="segmented-pill-text">New collection</span>
            </button>
            <button
              type="button"
              className={`segmented-pill-btn ${mode === 'existing' ? 'active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => handleModeChange('existing')}
            >
              {mode === 'existing' && (
                <motion.div
                  layoutId="collectModalModePill"
                  className="segmented-pill-slider"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}
              <span className="segmented-pill-text">Add to existing</span>
            </button>
          </div>
        )}

        {mode === 'new' || !hasExisting ? (
          <label className="field">
            <span>Collection name</span>
            <input
              className="input"
              maxLength={120}
              placeholder="e.g. Research, Project Alpha, Reading List"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onConfirm(undefined);
                }
              }}
            />
          </label>
        ) : (
          <div className="field">
            <span>Select existing collection</span>
            <CustomSelect
              value={targetCollectionId || sortedCollections[0]?.id || ''}
              options={sortedCollections.map((coll) => ({
                value: coll.id,
                label: `${coll.name} (${coll.tabs.length} ${coll.tabs.length === 1 ? 'tab' : 'tabs'})`,
              }))}
              onChange={(val) => onTargetCollectionIdChange?.(val)}
              ariaLabel="Select target collection"
              className="collect-modal-select"
            />
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={() => {
              if (mode === 'existing') {
                const effectiveId =
                  targetCollectionId || sortedCollections[0]?.id;
                onTargetCollectionIdChange?.(effectiveId);
                onConfirm(effectiveId);
              } else {
                onConfirm(undefined);
              }
            }}
          >
            {mode === 'existing' ? 'Add tabs' : 'Collect'}
          </button>
        </div>
      </div>
    </div>
  );
}
