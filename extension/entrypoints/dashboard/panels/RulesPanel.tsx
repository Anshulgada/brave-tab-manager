import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { DEFAULT_PREBUILT_RULES_JSONL } from '../../../src/ai';
import {
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  FolderIcon,
  PlusIcon,
  UploadIcon,
} from '../../../src/ui/icons';
import type { RuleItem } from '../types';

export function parseRulesToItems(rulesText: string): RuleItem[] {
  if (!rulesText.trim()) return [];
  const lines = rulesText.trim().split('\n');
  const items: RuleItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const name = String(
        obj.name || obj.group || obj.collectionName || `Rule ${i + 1}`,
      ).trim();
      const rawPatterns = Array.isArray(obj.patterns || obj.match)
        ? ((obj.patterns || obj.match) as string[])
        : [];
      items.push({
        id: `rule-${i}-${name}`,
        name: name || `Group ${i + 1}`,
        patterns: rawPatterns
          .map(String)
          .map((p) => p.trim())
          .filter(Boolean),
      });
    } catch {
      if (line.includes('->')) {
        const [pat, dest] = line.split('->').map((s) => s.trim());
        if (pat && dest) {
          items.push({ id: `rule-${i}-${dest}`, name: dest, patterns: [pat] });
        }
      } else if (line.includes(':')) {
        const [col, pats] = line.split(':').map((s) => s.trim());
        if (col && pats) {
          items.push({
            id: `rule-${i}-${col}`,
            name: col,
            patterns: pats
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          });
        }
      } else {
        items.push({
          id: `rule-${i}-gen`,
          name: 'General',
          patterns: [line],
        });
      }
    }
  }
  return items;
}

export function serializeRulesToJSONL(rulesList: RuleItem[]): string {
  return rulesList
    .map((item) =>
      JSON.stringify({
        name: item.name.trim(),
        patterns: item.patterns.filter(Boolean),
      }),
    )
    .join('\n');
}

export function RulesPanel({
  rules,
  onChange,
}: {
  rules: string;
  onChange: (v: string) => void;
}) {
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [items, setItems] = useState<RuleItem[]>(() =>
    parseRulesToItems(rules),
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [newPatterns, setNewPatterns] = useState<Record<string, string>>({});
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    setItems(parseRulesToItems(rules));
  }, [rules]);

  const saveToStorage = (updatedRules: string) => {
    try {
      localStorage.setItem('tabman-local-rules', updatedRules);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } catch {}
  };

  const updateItems = (nextItems: RuleItem[]) => {
    setItems(nextItems);
    const serialized = serializeRulesToJSONL(nextItems);
    onChange(serialized);
    saveToStorage(serialized);
  };

  const removeGroup = (groupId: string) => {
    updateItems(items.filter((item) => item.id !== groupId));
  };

  const removePattern = (groupId: string, patternIndex: number) => {
    updateItems(
      items.map((item) => {
        if (item.id !== groupId) return item;
        const nextPatterns = item.patterns.filter(
          (_, idx) => idx !== patternIndex,
        );
        return { ...item, patterns: nextPatterns };
      }),
    );
  };

  const addPattern = (groupId: string) => {
    const pat = (newPatterns[groupId] || '').trim();
    if (!pat) return;
    updateItems(
      items.map((item) => {
        if (item.id !== groupId) return item;
        return { ...item, patterns: [...item.patterns, pat] };
      }),
    );
    setNewPatterns((curr) => ({ ...curr, [groupId]: '' }));
  };

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    const newGroup: RuleItem = {
      id: `rule-${Date.now()}-${name}`,
      name,
      patterns: [],
    };
    updateItems([...items, newGroup]);
    setNewGroupName('');
  };

  const formatJSONL = () => {
    const parsed = parseRulesToItems(rules);
    const formatted = serializeRulesToJSONL(parsed);
    onChange(formatted);
    saveToStorage(formatted);
  };

  const resetToDefaults = () => {
    if (window.confirm('Reset all rules to the prebuilt default rules?')) {
      onChange(DEFAULT_PREBUILT_RULES_JSONL);
      saveToStorage(DEFAULT_PREBUILT_RULES_JSONL);
    }
  };

  const exportRules = () => {
    try {
      const blob = new Blob([rules], {
        type: 'application/x-jsonlines;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tabman-rules.jsonl';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  };

  const importRules = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl,.json,.txt';
    input.onchange = (event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const content = String(reader.result ?? '');
          onChange(content);
          saveToStorage(content);
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <section className="settings">
      <header className="settings-head">
        <p className="eyebrow">Organization</p>
        <h1>Local rules</h1>
        <p className="settings-intro">
          Match tabs into collections automatically using domain and URL
          patterns. Prebuilt with common services (AI, Media, Dev, Social).
        </p>
      </header>

      <div className="rules-toolbar">
        <div className="rules-toolbar-left">
          <div className="segmented-pill-track">
            <button
              type="button"
              className={`segmented-pill-btn ${
                mode === 'visual' ? 'active' : ''
              }`}
              aria-pressed={mode === 'visual'}
              onClick={() => setMode('visual')}
            >
              {mode === 'visual' && (
                <motion.div
                  layoutId="rulesModePill"
                  className="segmented-pill-slider"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="segmented-pill-text">Visual cards</span>
            </button>
            <button
              type="button"
              className={`segmented-pill-btn ${mode === 'code' ? 'active' : ''}`}
              aria-pressed={mode === 'code'}
              onClick={() => setMode('code')}
            >
              {mode === 'code' && (
                <motion.div
                  layoutId="rulesModePill"
                  className="segmented-pill-slider"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="segmented-pill-text">JSONL code</span>
            </button>
          </div>
          {savedToast && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--success, #22c55e)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <CheckIcon size={13} /> Rules saved
            </span>
          )}
        </div>

        <div className="rules-toolbar-right">
          {mode === 'code' && (
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={formatJSONL}
            >
              Format JSONL
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={resetToDefaults}
          >
            Reset to defaults
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={exportRules}
          >
            <DownloadIcon size={13} />
            Export
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={importRules}
          >
            <UploadIcon size={13} />
            Import
          </button>
        </div>
      </div>

      {mode === 'visual' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="rules-visual-grid">
            {items.map((item) => (
              <div className="rule-group-card" key={item.id}>
                <div className="rule-group-card-head">
                  <div className="rule-group-card-title">
                    <FolderIcon size={15} />
                    <span>{item.name}</span>
                  </div>
                  <button
                    type="button"
                    className="rule-group-delete-btn"
                    title={`Delete rule group "${item.name}"`}
                    aria-label={`Delete rule group ${item.name}`}
                    onClick={() => removeGroup(item.id)}
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>

                <div className="rule-patterns-wrap">
                  {item.patterns.length === 0 ? (
                    <span
                      style={{ fontSize: '12px', color: 'var(--text-muted)' }}
                    >
                      No patterns yet. Add one below.
                    </span>
                  ) : (
                    item.patterns.map((pat, pIdx) => (
                      <span
                        className="rule-pattern-chip"
                        key={`${item.id}-${pat}`}
                      >
                        <span>{pat}</span>
                        <button
                          type="button"
                          className="rule-pattern-remove"
                          title={`Remove ${pat}`}
                          aria-label={`Remove pattern ${pat}`}
                          onClick={() => removePattern(item.id, pIdx)}
                        >
                          <CloseIcon size={11} />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <form
                  className="rule-pattern-add-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addPattern(item.id);
                  }}
                >
                  <input
                    className="input input-compact"
                    placeholder="e.g. *domain.com*"
                    value={newPatterns[item.id] || ''}
                    onChange={(e) =>
                      setNewPatterns({
                        ...newPatterns,
                        [item.id]: e.target.value,
                      })
                    }
                  />
                  <button
                    type="submit"
                    className="btn btn-sm"
                    disabled={!(newPatterns[item.id] || '').trim()}
                  >
                    <PlusIcon size={12} />
                    Add
                  </button>
                </form>
              </div>
            ))}
          </div>

          <div
            style={{
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <input
              className="input"
              placeholder="New rule group name (e.g. Shopping, Finance)..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGroup();
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!newGroupName.trim()}
              onClick={addGroup}
            >
              <PlusIcon size={14} />
              Add group
            </button>
          </div>
        </div>
      ) : (
        <div className="rules-code-editor">
          <textarea
            className="input"
            rows={12}
            placeholder='{"name": "AI", "patterns": ["*chatgpt.com*", "*claude.ai*"]}'
            value={rules}
            onChange={(e) => {
              onChange(e.target.value);
              saveToStorage(e.target.value);
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Format: One JSON object per line with <code>name</code> and{' '}
              <code>patterns</code> array.
            </span>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => saveToStorage(rules)}
            >
              Save rules
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
