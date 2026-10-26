import { motion } from 'framer-motion';
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
}: TabCardProps) {
  const title = tabLabel(tab.title, tab.hostname, tab.url);
  const host = hostLabel(tab.hostname, tab.url);
  const tagColor = tags.find((t) => Boolean(t.color))?.color;

  return (
    <article
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
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tab.id);
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

      <a
        className="tab-title"
        href={tab.url}
        target="_blank"
        rel="noreferrer"
        title={tab.url}
      >
        {title}
      </a>

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
    </article>
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
    <article
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
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tab.id);
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
    </article>
  );
}
