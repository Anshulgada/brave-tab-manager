import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  fetchIframelyPreview,
  getCachedPreview,
  type IframelyPreview,
} from '../../../src/iframely';
import type { LibraryCollection } from '../../../src/library';
import { hostInitial, hostLabel, tabLabel } from '../../../src/ui/format';
import {
  ArrowUpRightIcon,
  CloseIcon,
  PencilIcon,
  PinIcon,
  PinSlashIcon,
} from '../../../src/ui/icons';

export interface TabCardProps {
  tab: LibraryCollection['tabs'][number];
  tags: { id: string; name: string; color?: string | null }[];
  selected: boolean;
  onToggle: () => void;
  onRestore: () => void;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  enableRichPreviews?: boolean;
  iframelyApiKey?: string | null;
}

export function TabCard({
  tab,
  tags,
  selected,
  onToggle,
  onRestore,
  onEdit,
  onPin,
  onDelete,
  onDragStart,
  onDragEnd,
  enableRichPreviews,
  iframelyApiKey,
}: TabCardProps) {
  const title = tabLabel(tab.title, tab.hostname, tab.url);
  const host = hostLabel(tab.hostname, tab.url);
  const tagColor = tags.find((t) => Boolean(t.color))?.color;

  const [preview, setPreview] = useState<IframelyPreview | null>(() =>
    getCachedPreview(tab.url),
  );

  useEffect(() => {
    let active = true;
    if (enableRichPreviews && iframelyApiKey?.trim() && !preview) {
      void fetchIframelyPreview(tab.url, iframelyApiKey).then((res) => {
        if (active && res) {
          setPreview(res);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [tab.url, enableRichPreviews, iframelyApiKey, preview]);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -3, transition: { duration: 0.16, ease: 'easeOut' } }}
      transition={{ duration: 0.2 }}
      className={[
        'tab-card',
        selected ? 'selected' : '',
        tab.pinned ? 'pinned' : '',
        tagColor ? 'has-tag-color' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderLeft: tagColor ? `4px solid ${tagColor}` : undefined,
      }}
      draggable
      onDragStart={(event) => {
        const dragEvent = event as unknown as React.DragEvent;
        dragEvent.dataTransfer.effectAllowed = 'move';
        dragEvent.dataTransfer.setData('text/plain', tab.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="tab-card-header">
        <div className="tab-card-source">
          <span className="tab-card-check-wrap">
            <input
              className="checkbox"
              type="checkbox"
              aria-label={`Select ${title}`}
              checked={selected}
              onChange={onToggle}
            />
          </span>
          {tab.favIconUrl ? (
            <img
              className="tab-favicon"
              src={tab.favIconUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : (
            <span className="tab-favicon fallback" aria-hidden="true">
              {hostInitial(tab.hostname, tab.url)}
            </span>
          )}
          <span className="tab-host" title={tab.hostname}>
            {host}
          </span>
          {tab.pinned && (
            <span className="tab-pinned-pill" title="Pinned tab">
              <PinIcon size={10} />
              <span>Pinned</span>
            </span>
          )}
        </div>

        <div className="tab-card-actions">
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className="tab-action-btn"
            type="button"
            title="Open in new window"
            aria-label="Open tab in new window"
            onClick={onRestore}
          >
            <ArrowUpRightIcon size={14} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className={`tab-action-btn ${tab.pinned ? 'is-pinned' : ''}`}
            type="button"
            title={tab.pinned ? 'Unpin this tab' : 'Pin this tab'}
            aria-label={tab.pinned ? 'Unpin this tab' : 'Pin this tab'}
            onClick={onPin}
          >
            {tab.pinned ? <PinSlashIcon size={14} /> : <PinIcon size={14} />}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className="tab-action-btn"
            type="button"
            title="Edit this tab"
            aria-label="Edit this tab"
            onClick={onEdit}
          >
            <PencilIcon size={14} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className="tab-action-btn tab-action-delete"
            type="button"
            title="Delete this tab"
            aria-label="Delete this tab"
            onClick={onDelete}
          >
            <CloseIcon size={14} />
          </motion.button>
        </div>
      </div>

      {preview?.thumbnailUrl && (
        <div className="tab-preview-cover">
          <img
            src={preview.thumbnailUrl}
            alt=""
            loading="lazy"
            onError={(e) => {
              const parent = e.currentTarget.parentElement;
              if (parent) parent.style.display = 'none';
            }}
          />
        </div>
      )}

      <a
        className="tab-title"
        href={tab.url}
        target="_blank"
        rel="noreferrer"
        title={tab.url}
      >
        {preview?.title || title}
      </a>

      {preview?.description && (
        <p className="tab-preview-desc" title={preview.description}>
          {preview.description}
        </p>
      )}

      {tags.length > 0 && (
        <div className="tab-tags">
          {tags.map((tag) => (
            <span className="chip" key={tag.id}>
              {tag.color && (
                <span
                  className="tag-color-dot"
                  style={{ background: tag.color }}
                  aria-hidden="true"
                />
              )}
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </motion.article>
  );
}

export function TabRow({
  tab,
  tags,
  selected,
  onToggle,
  onRestore,
  onEdit,
  onPin,
  onDelete,
  onDragStart,
  onDragEnd,
}: TabCardProps) {
  const title = tabLabel(tab.title, tab.hostname, tab.url);
  const host = hostLabel(tab.hostname, tab.url);
  const tagColor = tags.find((t) => Boolean(t.color))?.color;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      whileHover={{ x: 2, transition: { duration: 0.15 } }}
      transition={{ duration: 0.18 }}
      className={[
        'tab-row',
        selected ? 'selected' : '',
        tab.pinned ? 'pinned' : '',
        tagColor ? 'has-tag-color' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderLeft: tagColor ? `4px solid ${tagColor}` : undefined,
      }}
      draggable
      onDragStart={(event) => {
        const dragEvent = event as unknown as React.DragEvent;
        dragEvent.dataTransfer.effectAllowed = 'move';
        dragEvent.dataTransfer.setData('text/plain', tab.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <input
        className="checkbox"
        type="checkbox"
        aria-label={`Select ${title}`}
        checked={selected}
        onChange={onToggle}
      />
      {tab.favIconUrl ? (
        <img
          className="tab-favicon"
          src={tab.favIconUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : (
        <span className="tab-favicon fallback" aria-hidden="true">
          {hostInitial(tab.hostname, tab.url)}
        </span>
      )}
      <a
        className="tab-row-main"
        href={tab.url}
        target="_blank"
        rel="noreferrer"
        title={tab.url}
      >
        <strong>{title}</strong>
        <span>{host}</span>
      </a>
      <div className="tab-row-tags">
        {tags.map((tag) => (
          <span className="chip" key={tag.id}>
            {tag.color && (
              <span
                className="tag-color-dot"
                style={{ background: tag.color }}
                aria-hidden="true"
              />
            )}
            {tag.name}
          </span>
        ))}
        {tab.pinned && (
          <span className="tab-pinned-pill" title="Pinned tab">
            <PinIcon size={10} />
          </span>
        )}
      </div>
      <div className="tab-row-actions">
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title="Restore this tab"
          aria-label="Restore this tab"
          onClick={onRestore}
        >
          <ArrowUpRightIcon size={15} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          className={`btn btn-ghost btn-icon btn-sm ${tab.pinned ? 'is-pinned' : ''}`}
          type="button"
          title={tab.pinned ? 'Unpin this tab' : 'Pin this tab'}
          aria-label={tab.pinned ? 'Unpin this tab' : 'Pin this tab'}
          onClick={onPin}
        >
          {tab.pinned ? <PinSlashIcon size={15} /> : <PinIcon size={15} />}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title="Edit this tab"
          aria-label="Edit this tab"
          onClick={onEdit}
        >
          <PencilIcon size={15} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.85 }}
          className="btn btn-ghost btn-icon btn-sm"
          type="button"
          title="Delete this tab"
          aria-label="Delete this tab"
          onClick={onDelete}
        >
          <CloseIcon size={15} />
        </motion.button>
      </div>
    </motion.article>
  );
}
