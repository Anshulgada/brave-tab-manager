import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { AnimatedTabs } from '../../../src/components/motion/animated-tabs';
import { Button } from '../../../src/components/ui/button';
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
      <motion.div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Collect open tabs"
        initial={{ opacity: 0, scale: 0.98, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -6 }}
        transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
      >
        <h2>Collect open tabs</h2>
        <p className="settings-intro">
          Save open browser tabs into your Tabman library without closing them.
        </p>

        {hasExisting && (
          <AnimatedTabs<'new' | 'existing'>
            tabs={[
              { id: 'new', label: 'New collection' },
              { id: 'existing', label: 'Add to existing' },
            ]}
            activeTab={mode}
            onChange={handleModeChange}
            layoutId="collectModalModePill"
            className="w-full mb-3.5"
            tabClassName="flex-1"
          />
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
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
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
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
