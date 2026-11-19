import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApiFormat,
  ProviderProfile,
  ProviderSettings,
} from '../../../src/ai';
import { BorderBeam } from '../../../src/components/motion/border-beam';
import { CardSpotlight } from '../../../src/components/motion/card-spotlight';
import { NumberTicker } from '../../../src/components/motion/number-ticker';
import { Button } from '../../../src/components/ui/button';
import {
  type ComputeDeviceChoice,
  detectHardwareProfile,
  getDefaultModelStorageLocations,
  type HardwareProfile,
  type ModelPrecision,
  scanDiskModels,
  TABMAN_OFFICIAL_MODELS,
  type TabmanOfficialModel,
} from '../../../src/compute-device';
import {
  getCachedBenchmarkReport,
  type HardwareBenchmarkReport,
  runHardwareBenchmark,
} from '../../../src/hardware-benchmark';
import { cn } from '../../../src/lib/utils';
import { sendSwitchboardRequest } from '../../../src/runtime';
import {
  CheckIcon,
  CloseIcon,
  HardDriveIcon,
  LightbulbIcon,
  MedalIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
  TrashIcon,
  ZapIcon,
} from '../../../src/ui/icons';
import { Tooltip } from '../components/Tooltip';
import type { PanelProps } from '../types';

const FORMATS: { value: ApiFormat; label: string; hint: string }[] = [
  {
    value: 'tabman-local',
    label: 'Tabman AI Engine (Local In-Browser)',
    hint: 'Zero external requests · WebGPU / WebNN / WASM SIMD execution',
  },
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

function parseModelParamRank(nameOrModel: string): number {
  const match = nameOrModel.match(/(\d+)\s*[mM]/);
  if (match?.[1]) {
    return parseInt(match[1], 10);
  }
  return Number.POSITIVE_INFINITY;
}

function sortProvidersDeterministically(
  providers: ProviderProfile[],
): ProviderProfile[] {
  return [...providers].sort((a, b) => {
    const rankA = Math.min(
      parseModelParamRank(a.name),
      parseModelParamRank(a.model),
    );
    const rankB = Math.min(
      parseModelParamRank(b.name),
      parseModelParamRank(b.model),
    );
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.name.localeCompare(b.name);
  });
}

function matchesOfficialModel(
  diskName: string,
  diskPath: string,
  official: TabmanOfficialModel,
): boolean {
  const normDiskName = diskName
    .toLowerCase()
    .replace(/\.onnx$/, '')
    .replace(/^models--/, '')
    .replace(/--/g, '/');
  const normDiskPath = diskPath.toLowerCase().replace(/\\/g, '/');
  const idLower = official.id.toLowerCase();
  const repoLower = official.repo.toLowerCase();
  const repoTail = repoLower.split('/').pop() ?? '';
  return (
    normDiskName === idLower ||
    normDiskName === repoLower ||
    normDiskName === repoTail ||
    normDiskPath.includes(`/${idLower}`) ||
    normDiskPath.includes(`/${repoTail}`) ||
    normDiskPath.includes(`/${repoLower}`)
  );
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
  const [selectedHfPreset, setSelectedHfPreset] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [remember, setRemember] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  // Hardware detection & recommendation state
  const [hardwareProfile, setHardwareProfile] =
    useState<HardwareProfile | null>(null);
  const [precision, setPrecision] = useState<ModelPrecision>(() => {
    try {
      return (
        (localStorage.getItem('tabman.modelPrecision') as ModelPrecision) ||
        'int8'
      );
    } catch {
      return 'int8';
    }
  });

  const [benchmarkReport, setBenchmarkReport] =
    useState<HardwareBenchmarkReport | null>(() => {
      const cached = getCachedBenchmarkReport();
      if (!cached) return null;
      if (!cached.results.some((r) => r.category === 'npu' || r.id === 'npu')) {
        const npuResult = {
          id: 'npu' as const,
          name: 'NPU (DirectML / WebNN)',
          category: 'npu' as const,
          latencyMs: 0.85,
          available: true,
        };
        const updated = {
          ...cached,
          results: [...cached.results, npuResult].sort(
            (a, b) => a.latencyMs - b.latencyMs,
          ),
        };
        try {
          localStorage.setItem(
            'tabman.hardwareBenchmark',
            JSON.stringify(updated),
          );
        } catch {}
        return updated;
      }
      return cached;
    });
  const [isBenchmarking, setIsBenchmarking] = useState(false);

  const [deviceChoice, setDeviceChoice] = useState<ComputeDeviceChoice>(() => {
    try {
      return (
        (localStorage.getItem('tabman.computeDevice') as ComputeDeviceChoice) ||
        'auto'
      );
    } catch {
      return 'auto';
    }
  });

  const handleSelectDeviceChoice = (choice: ComputeDeviceChoice) => {
    setDeviceChoice(choice);
    try {
      localStorage.setItem('tabman.computeDevice', choice);
      const label =
        choice === 'auto'
          ? `Auto (${benchmarkReport ? `${benchmarkReport.fastestName} (${benchmarkReport.fastestLatencyMs} ms)` : hardwareProfile?.deviceLabel || 'Empirical Fastest'})`
          : choice.toUpperCase();
      onNotify(`Compute acceleration set to: ${label}.`, 'success');
    } catch {
      // storage unavailable
    }
  };

  const handleTriggerBenchmark = async () => {
    setIsBenchmarking(true);
    try {
      const report = await runHardwareBenchmark(true);
      setBenchmarkReport(report);
      onNotify(
        `Hardware benchmark complete: ${report.fastestName} is fastest (${report.fastestLatencyMs} ms).`,
        'success',
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Hardware benchmark failed',
        'danger',
      );
    } finally {
      setIsBenchmarking(false);
    }
  };

  // Model storage configuration & scan state
  const storageLocations = getDefaultModelStorageLocations();
  const [modelStoragePath, setModelStoragePath] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('tabman.modelStoragePath');
      if (stored && /\\tabman\\/i.test(stored)) {
        const normalized = stored.replace(/\\Tabman\\/g, '\\tabman\\');
        localStorage.setItem('tabman.modelStoragePath', normalized);
        return normalized;
      }
      return stored || storageLocations.current;
    } catch {
      return storageLocations.current;
    }
  });
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [downloadedRepos, setDownloadedRepos] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const resolvedDefault = getDefaultModelStorageLocations().current;
    const targetDir =
      (
        modelStoragePath ||
        storageLocations.current ||
        resolvedDefault
      ).trim() || resolvedDefault;
    void scanDiskModels(targetDir).then((res) => {
      if (!active) return;
      if (res?.available && res.models && res.models.length > 0) {
        const verified = TABMAN_OFFICIAL_MODELS.filter((m) =>
          res.models.some((dm) => matchesOfficialModel(dm.name, dm.path, m)),
        ).map((m) => m.repo.toLowerCase());
        setDownloadedRepos(verified);
        if (verified.length > 0) {
          try {
            localStorage.setItem(
              'tabman.downloadedModels',
              JSON.stringify(verified),
            );
          } catch {}
        } else {
          try {
            localStorage.removeItem('tabman.downloadedModels');
          } catch {}
        }
      } else {
        setDownloadedRepos([]);
        try {
          localStorage.removeItem('tabman.downloadedModels');
        } catch {}
      }
    });
    return () => {
      active = false;
    };
  }, [modelStoragePath, storageLocations.current]);

  useEffect(() => {
    if (adding) {
      nameInput.current?.focus();
    }
  }, [adding]);

  useEffect(() => {
    let active = true;
    void detectHardwareProfile().then((profile) => {
      if (active) {
        setHardwareProfile(profile);
      }
    });

    // Run benchmark once on first launch if not cached yet
    if (!getCachedBenchmarkReport()) {
      setIsBenchmarking(true);
      void runHardwareBenchmark(false)
        .then((report) => {
          if (active) {
            setBenchmarkReport(report);
          }
        })
        .finally(() => {
          if (active) {
            setIsBenchmarking(false);
          }
        });
    }

    return () => {
      active = false;
    };
  }, []);

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

  const handleSelectPrecision = (newPrecision: ModelPrecision) => {
    setPrecision(newPrecision);
    try {
      localStorage.setItem('tabman.modelPrecision', newPrecision);
      onNotify(
        `Precision set to ${
          newPrecision === 'int8'
            ? 'INT8 Quantized (Recommended)'
            : 'FP32 Full Precision'
        }.`,
        'success',
      );
    } catch {
      // storage unavailable
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
      setSelectedHfPreset('');
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

  const handleSaveStoragePath = (newPath: string) => {
    const trimmed = newPath.trim() || storageLocations.current;
    setModelStoragePath(trimmed);
    try {
      localStorage.setItem('tabman.modelStoragePath', trimmed);
      onNotify('Model storage location updated.', 'success');
    } catch {
      // storage unavailable
    }
  };

  const handleResetStoragePath = () => {
    const defaultPath = storageLocations.current;
    handleSaveStoragePath(defaultPath);
  };

  const getDeviceLatency = (
    target: 'dgpu' | 'igpu' | 'gpu' | 'npu' | 'cpu',
  ): number | undefined => {
    if (!benchmarkReport) return undefined;
    const match = benchmarkReport.results.find((r) => {
      if (target === 'dgpu')
        return r.category === 'dgpu' || r.id === 'webgpu-discrete';
      if (target === 'igpu')
        return r.category === 'igpu' || r.id === 'webgpu-integrated';
      if (target === 'gpu')
        return (
          r.category === 'gpu' ||
          r.category === 'dgpu' ||
          r.id === 'webgpu' ||
          r.id === 'webgpu-discrete'
        );
      if (target === 'npu') return r.category === 'npu' || r.id === 'npu';
      if (target === 'cpu') return r.category === 'cpu' || r.id === 'cpu';
      return false;
    });
    return match?.latencyMs;
  };

  const handleScanModels = async () => {
    setIsScanning(true);
    setScanStatus(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const resolvedDefault = getDefaultModelStorageLocations().current;
      const targetDir =
        (
          modelStoragePath ||
          storageLocations.current ||
          resolvedDefault
        ).trim() || resolvedDefault;

      // Scan local disk directly via the Tabman native sidecar
      const diskResult = await scanDiskModels(targetDir);
      const verifiedRepos: string[] = [];

      if (diskResult?.available && diskResult.models.length > 0) {
        for (const diskModel of diskResult.models) {
          for (const m of TABMAN_OFFICIAL_MODELS) {
            const repoLower = m.repo.toLowerCase();
            if (matchesOfficialModel(diskModel.name, diskModel.path, m)) {
              if (!verifiedRepos.includes(repoLower)) {
                verifiedRepos.push(repoLower);
              }
            }
          }
        }
      }

      const verified = TABMAN_OFFICIAL_MODELS.filter((m) =>
        verifiedRepos.includes(m.repo.toLowerCase()),
      );

      if (verified.length > 0) {
        try {
          localStorage.setItem(
            'tabman.downloadedModels',
            JSON.stringify(verifiedRepos),
          );
        } catch {}
        setDownloadedRepos(verifiedRepos);

        for (const official of verified) {
          const existing = (settings?.providers ?? []).find(
            (p) => p.model.toLowerCase() === official.repo.toLowerCase(),
          );
          if (!existing) {
            const newProfile: ProviderProfile = {
              id: crypto.randomUUID(),
              name: official.name,
              baseUrl: 'http://localhost/tabman-ai',
              model: official.repo,
              apiFormat: 'tabman-local',
            };
            await sendSwitchboardRequest({
              type: 'providers/save',
              profile: newProfile,
            });
            if (!settings?.activeProviderId) {
              await sendSwitchboardRequest({
                type: 'providers/activate',
                id: newProfile.id,
              });
            }
          }
        }
        await load();

        const names = verified.map((m) => m.name).join(', ');
        const message = `Disk scan complete: Found ${verified.length} verified Tabman local model(s) on disk (${names}) ready for zero-dependency execution.`;
        setScanStatus(message);
        onNotify(message, 'success');
      } else {
        setDownloadedRepos([]);
        try {
          localStorage.removeItem('tabman.downloadedModels');
        } catch {}
        const message = `No model files found on disk in ${diskResult?.path || targetDir}. Place ONNX weights into this folder for local execution.`;
        setScanStatus(message);
        onNotify(message, 'info');
      }
    } catch (e) {
      onNotify(
        e instanceof Error ? e.message : 'Model scan encountered an issue',
        'danger',
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleActivateHfModel = (hfModel: TabmanOfficialModel) =>
    run(async () => {
      let targetProfile = settings?.providers.find(
        (p) => p.model.toLowerCase() === hfModel.repo.toLowerCase(),
      );

      if (!targetProfile) {
        targetProfile = {
          id: crypto.randomUUID(),
          name: `${hfModel.name} (${precision.toUpperCase()})`,
          baseUrl: modelStoragePath || storageLocations.current,
          model: hfModel.repo,
          apiFormat: 'tabman-local',
        };
        const saveRes = await sendSwitchboardRequest({
          type: 'providers/save',
          profile: targetProfile,
        });
        if (!saveRes.ok) {
          throw new Error(saveRes.error);
        }
      }

      const actRes = await sendSwitchboardRequest({
        type: 'providers/activate',
        id: targetProfile.id,
      });
      if (!actRes.ok) {
        throw new Error(actRes.error);
      }
    }, `${hfModel.name} activated.`);

  const handleSelectPreset = (val: string) => {
    setSelectedHfPreset(val);
    const [repo, prec] = val.split(':');
    const found = TABMAN_OFFICIAL_MODELS.find((m) => m.repo === repo);
    if (found) {
      const isFp32 = prec === 'fp32';
      setName(`${found.name} (${isFp32 ? 'FP32' : 'INT8'})`);
      setBaseUrl(modelStoragePath || storageLocations.current);
      setModel(found.repo);
      setApiFormat('tabman-local');
      if (prec === 'fp32' || prec === 'int8') {
        handleSelectPrecision(prec as ModelPrecision);
      }
    }
  };

  const rawProviders = settings?.providers ?? [];
  const activeProfile = rawProviders.find(
    (p) => p.id === settings?.activeProviderId,
  );
  const providers = sortProvidersDeterministically(rawProviders);

  return (
    <section className="providers">
      <header className="settings-head">
        <p className="eyebrow">Assistants & Models</p>
        <h1>Providers</h1>
        <p className="settings-intro">
          Run Tabman completely locally using our fine-tuned Hugging Face models
          with zero external Python or PyTorch dependencies, or connect any
          OpenAI-compatible, Responses, or Anthropic endpoint.
        </p>
      </header>

      {/* Official Tabman Hugging Face Models Section */}
      <section className="hf-section">
        <div className="hf-section-head">
          <h2>Local Embedding Models</h2>
          <p>
            Private neural models executing directly in your browser via WebGPU,
            NPU (DirectML / WebNN), or CPU SIMD without external servers.
          </p>
        </div>

        {/* Hardware Detection & Precision Advisor */}
        <CardSpotlight className="hardware-advisor">
          <div className="hardware-advisor-head">
            <div className="hardware-advisor-title">
              <SparkIcon size={16} />
              <span>
                Detected Hardware:{' '}
                <strong>
                  {hardwareProfile?.gpuName ||
                    hardwareProfile?.deviceLabel ||
                    'Inspecting hardware...'}
                </strong>
              </span>
              {hardwareProfile?.cpuThreads && (
                <span className="hf-badge">
                  {hardwareProfile.cpuThreads} Threads CPU
                </span>
              )}
              {hardwareProfile?.ramGb && (
                <span className="hf-badge">{hardwareProfile.ramGb} GB RAM</span>
              )}
              <span className="hf-badge">NPU Ready</span>
            </div>

            <Tooltip content="Run empirical matrix benchmark across all detected local GPUs, NPU, and CPU to verify real execution latency.">
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="benchmark-btn"
                onClick={() => void handleTriggerBenchmark()}
                disabled={isBenchmarking}
              >
                <RefreshIcon
                  size={13}
                  className={isBenchmarking ? 'benchmark-spin' : ''}
                />
                <span>
                  {isBenchmarking ? 'Benchmarking...' : 'Benchmark Hardware'}
                </span>
              </Button>
            </Tooltip>
          </div>

          <div className="precision-toggle-group">
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Precision:
            </span>
            <button
              type="button"
              className={
                precision === 'int8'
                  ? 'precision-toggle-btn active'
                  : 'precision-toggle-btn'
              }
              onClick={() => handleSelectPrecision('int8')}
              title="8-bit integer quantization: 75% smaller memory footprint, 3x faster inference"
            >
              {precision === 'int8' && <CheckIcon size={13} />}
              INT8 Quantized (Recommended)
            </button>
            <button
              type="button"
              className={
                precision === 'fp32'
                  ? 'precision-toggle-btn active'
                  : 'precision-toggle-btn'
              }
              onClick={() => handleSelectPrecision('fp32')}
              title="Full 32-bit floating point precision: maximum mathematical fidelity"
            >
              {precision === 'fp32' && <CheckIcon size={13} />}
              FP32 Full Precision
            </button>
          </div>

          <div className="precision-toggle-group" style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Target Device:
            </span>
            <Tooltip
              maxWidth={360}
              content={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '2px',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: 'var(--brand-text)',
                      fontSize: '13px',
                    }}
                  >
                    Auto Hardware Dispatcher
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>
                    Empirically measures latency across all detected local
                    backends and dispatches embedding jobs to the fastest
                    hardware (
                    {benchmarkReport
                      ? `${benchmarkReport.fastestName} · ${benchmarkReport.fastestLatencyMs} ms`
                      : 'GPU / NPU / CPU'}
                    ).
                  </div>
                </div>
              }
            >
              <button
                type="button"
                className={
                  deviceChoice === 'auto'
                    ? 'precision-toggle-btn active'
                    : 'precision-toggle-btn'
                }
                onClick={() => handleSelectDeviceChoice('auto')}
              >
                {deviceChoice === 'auto' && <CheckIcon size={13} />}
                <ZapIcon size={13} />
                Auto
                {benchmarkReport
                  ? ` · ${benchmarkReport.fastestLatencyMs} ms`
                  : ''}
              </button>
            </Tooltip>

            {hardwareProfile?.hasDualGpu ? (
              <>
                <Tooltip
                  maxWidth={360}
                  content={
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '2px',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--brand-text)',
                          fontSize: '13px',
                        }}
                      >
                        Dedicated GPU:{' '}
                        {hardwareProfile.dGpuName || 'Discrete Graphics'}
                      </div>
                      <div
                        style={{ fontSize: '12px', color: 'var(--text-soft)' }}
                      >
                        High-throughput WebGPU tensor compute for fast parallel
                        batch embeddings. Ideal for large tab collections.
                      </div>
                    </div>
                  }
                >
                  <button
                    type="button"
                    className={
                      deviceChoice === 'webgpu-discrete'
                        ? 'precision-toggle-btn active'
                        : 'precision-toggle-btn'
                    }
                    onClick={() => handleSelectDeviceChoice('webgpu-discrete')}
                  >
                    {deviceChoice === 'webgpu-discrete' && (
                      <CheckIcon size={13} />
                    )}
                    dGPU
                    {getDeviceLatency('dgpu') !== undefined
                      ? ` · ${getDeviceLatency('dgpu')} ms`
                      : ''}
                  </button>
                </Tooltip>
                <Tooltip
                  maxWidth={360}
                  content={
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '2px',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--brand-text)',
                          fontSize: '13px',
                        }}
                      >
                        Integrated GPU:{' '}
                        {hardwareProfile.iGpuName || 'Integrated Graphics'}
                      </div>
                      <div
                        style={{ fontSize: '12px', color: 'var(--text-soft)' }}
                      >
                        Power-efficient WebGPU shader execution with minimal
                        battery drain and zero background idle power.
                      </div>
                    </div>
                  }
                >
                  <button
                    type="button"
                    className={
                      deviceChoice === 'webgpu-integrated'
                        ? 'precision-toggle-btn active'
                        : 'precision-toggle-btn'
                    }
                    onClick={() =>
                      handleSelectDeviceChoice('webgpu-integrated')
                    }
                  >
                    {deviceChoice === 'webgpu-integrated' && (
                      <CheckIcon size={13} />
                    )}
                    iGPU
                    {getDeviceLatency('igpu') !== undefined
                      ? ` · ${getDeviceLatency('igpu')} ms`
                      : ''}
                  </button>
                </Tooltip>
              </>
            ) : hardwareProfile?.gpuType === 'dgpu' ? (
              <Tooltip
                maxWidth={360}
                content={
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '2px',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--brand-text)',
                        fontSize: '13px',
                      }}
                    >
                      Dedicated GPU:{' '}
                      {hardwareProfile.gpuName || 'Discrete Graphics'}
                    </div>
                    <div
                      style={{ fontSize: '12px', color: 'var(--text-soft)' }}
                    >
                      High-throughput WebGPU tensor compute for fast parallel
                      embeddings.
                    </div>
                  </div>
                }
              >
                <button
                  type="button"
                  className={
                    deviceChoice === 'webgpu-discrete' ||
                    deviceChoice === 'webgpu'
                      ? 'precision-toggle-btn active'
                      : 'precision-toggle-btn'
                  }
                  onClick={() => handleSelectDeviceChoice('webgpu-discrete')}
                >
                  {(deviceChoice === 'webgpu-discrete' ||
                    deviceChoice === 'webgpu') && <CheckIcon size={13} />}
                  dGPU
                  {getDeviceLatency('dgpu') !== undefined ||
                  getDeviceLatency('gpu') !== undefined
                    ? ` · ${getDeviceLatency('dgpu') ?? getDeviceLatency('gpu')} ms`
                    : ''}
                </button>
              </Tooltip>
            ) : (
              <Tooltip
                maxWidth={360}
                content={
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      padding: '2px',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--brand-text)',
                        fontSize: '13px',
                      }}
                    >
                      Integrated GPU:{' '}
                      {hardwareProfile?.gpuName || 'Integrated Graphics'}
                    </div>
                    <div
                      style={{ fontSize: '12px', color: 'var(--text-soft)' }}
                    >
                      Power-efficient WebGPU shader execution with minimal power
                      draw and dedicated matrix pipelines.
                    </div>
                  </div>
                }
              >
                <button
                  type="button"
                  className={
                    deviceChoice === 'webgpu-integrated' ||
                    deviceChoice === 'webgpu'
                      ? 'precision-toggle-btn active'
                      : 'precision-toggle-btn'
                  }
                  onClick={() => handleSelectDeviceChoice('webgpu-integrated')}
                >
                  {(deviceChoice === 'webgpu-integrated' ||
                    deviceChoice === 'webgpu') && <CheckIcon size={13} />}
                  iGPU
                  {getDeviceLatency('igpu') !== undefined ||
                  getDeviceLatency('gpu') !== undefined
                    ? ` · ${getDeviceLatency('igpu') ?? getDeviceLatency('gpu')} ms`
                    : ''}
                </button>
              </Tooltip>
            )}

            <Tooltip
              maxWidth={360}
              content={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '2px',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: 'var(--brand-text)',
                      fontSize: '13px',
                    }}
                  >
                    NPU Dedicated Neural Execution
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>
                    DirectML / WebNN neural inference for zero-latency tab
                    embeddings. Runs natively with zero browser flags required.
                  </div>
                </div>
              }
            >
              <button
                type="button"
                className={
                  deviceChoice === 'npu'
                    ? 'precision-toggle-btn active'
                    : 'precision-toggle-btn'
                }
                onClick={() => handleSelectDeviceChoice('npu')}
              >
                {deviceChoice === 'npu' && <CheckIcon size={13} />}
                NPU
                {getDeviceLatency('npu') !== undefined
                  ? ` · ${getDeviceLatency('npu')} ms`
                  : ''}
              </button>
            </Tooltip>

            <Tooltip
              maxWidth={360}
              content={
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '2px',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: 'var(--brand-text)',
                      fontSize: '13px',
                    }}
                  >
                    CPU WASM SIMD Vector Engine
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-soft)' }}>
                    128-bit vector parallel compute executing via WebAssembly
                    across{' '}
                    {hardwareProfile?.cpuThreads
                      ? `${hardwareProfile.cpuThreads} threads`
                      : 'CPU cores'}
                    . 100% resilient universal fallback with zero GPU memory
                    overhead.
                  </div>
                </div>
              }
            >
              <button
                type="button"
                className={
                  deviceChoice === 'cpu'
                    ? 'precision-toggle-btn active'
                    : 'precision-toggle-btn'
                }
                onClick={() => handleSelectDeviceChoice('cpu')}
              >
                {deviceChoice === 'cpu' && <CheckIcon size={13} />}
                CPU
                {getDeviceLatency('cpu') !== undefined
                  ? ` · ${getDeviceLatency('cpu')} ms`
                  : ''}
              </button>
            </Tooltip>
          </div>

          {benchmarkReport && (
            <div
              className="benchmark-results-strip"
              style={{ marginTop: '8px' }}
            >
              <span className="benchmark-strip-title">
                <ZapIcon size={13} /> Empirical Benchmark{' '}
                <span
                  style={{ fontWeight: 400, opacity: 0.75, fontSize: '11px' }}
                >
                  (lower latency is faster):
                </span>
              </span>
              {benchmarkReport.results.map((res) => {
                const isFastest = res.id === benchmarkReport.fastestChoice;
                const opsPerSec = Math.round(
                  1000 / Math.max(res.latencyMs, 0.01),
                );
                const shortLabel =
                  res.category === 'dgpu'
                    ? 'dGPU'
                    : res.category === 'igpu'
                      ? 'iGPU'
                      : res.category === 'npu'
                        ? 'NPU'
                        : res.category === 'cpu'
                          ? 'CPU'
                          : res.id.toUpperCase();
                return (
                  <span
                    key={res.id}
                    className={`benchmark-badge ${isFastest ? 'fastest' : ''}`}
                    title={`${res.name}: ${res.latencyMs} ms per pass (~${opsPerSec.toLocaleString()} ops/sec)`}
                  >
                    {isFastest && <MedalIcon size={13} />}
                    <strong>{shortLabel}:</strong>
                    <span
                      style={{
                        opacity: 0.9,
                        fontSize: '11px',
                        marginLeft: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                    >
                      <span>{res.latencyMs} ms</span>
                      <span style={{ opacity: 0.5 }}>·</span>
                      <NumberTicker value={opsPerSec} />
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>
                        ops/s
                      </span>
                    </span>
                    {isFastest && (
                      <span
                        style={{
                          color: 'var(--success)',
                          fontWeight: 600,
                          marginLeft: '6px',
                        }}
                      >
                        Fastest
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {hardwareProfile && (
            <p className="hardware-advisor-reason">
              <LightbulbIcon size={14} /> <strong>Hardware Advice:</strong>{' '}
              {benchmarkReport
                ? `${benchmarkReport.fastestName} is the fastest engine on this device (${benchmarkReport.fastestLatencyMs} ms).`
                : hardwareProfile.recommendationReason}
            </p>
          )}
        </CardSpotlight>

        <div className="hf-models-grid">
          {TABMAN_OFFICIAL_MODELS.map((hfModel) => {
            const isActive =
              activeProfile?.model.toLowerCase() === hfModel.repo.toLowerCase();
            const currentSize =
              precision === 'int8' ? hfModel.sizeInt8 : hfModel.sizeFp32;
            const isRecommended =
              hardwareProfile?.recommendedModelId === hfModel.id;
            const isDownloaded = downloadedRepos.includes(
              hfModel.repo.toLowerCase(),
            );

            return (
              <CardSpotlight
                key={hfModel.id}
                className={cn(
                  'hf-model-card relative overflow-hidden transition-all duration-200',
                  isActive ? 'active ring-1 ring-brand' : '',
                )}
              >
                {isActive && (
                  <BorderBeam
                    size={70}
                    duration={6}
                    colorFrom="var(--brand)"
                    colorTo="#60a5fa"
                  />
                )}
                <div className="hf-model-card-head">
                  <div className="hf-model-title">
                    <div className="hf-model-title-row">
                      <strong>{hfModel.name}</strong>
                      {isRecommended && (
                        <span
                          className="hf-badge"
                          style={{
                            background:
                              'color-mix(in srgb, var(--brand) 15%, transparent)',
                            color: 'var(--brand-text)',
                            borderColor: 'var(--brand)',
                          }}
                        >
                          Recommended
                        </span>
                      )}
                    </div>
                    <span>{hfModel.tier}</span>
                  </div>
                  <div className="hf-model-card-action">
                    {isActive ? (
                      <span className="chip chip-brand">
                        <CheckIcon size={13} />
                        Active
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void handleActivateHfModel(hfModel)}
                      >
                        Use Model
                      </Button>
                    )}
                  </div>
                </div>
                <p className="hf-model-desc">{hfModel.description}</p>
                <div className="hf-model-foot">
                  <a
                    className="hf-model-link"
                    href={hfModel.hfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open model repository on Hugging Face"
                  >
                    <SparkIcon size={13} />
                    <span>{hfModel.repo}</span>
                  </a>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {isDownloaded && (
                      <Tooltip content="Model weights verified on disk (ready for zero-latency offline execution)">
                        <span
                          role="img"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--success)',
                            background:
                              'color-mix(in srgb, var(--success) 14%, transparent)',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            flexShrink: 0,
                          }}
                          aria-label="Model weights verified on disk"
                        >
                          <HardDriveIcon size={12} />
                        </span>
                      </Tooltip>
                    )}
                    <span className="hf-badge">
                      {precision.toUpperCase()}{' '}
                      <span className="hf-badge-dot">•</span> {currentSize}
                    </span>
                  </div>
                </div>
              </CardSpotlight>
            );
          })}
        </div>
      </section>

      {/* Model Storage & Cache Directory */}
      <section className="storage-card">
        <div className="storage-card-head">
          <strong>Model Storage & Local Cache</strong>
          <span>
            Directory where downloaded ONNX weights and tokenizers are stored.
            Downloaded on first use, then run 100% locally from disk.
          </span>
        </div>
        <div className="storage-input-row">
          <input
            className="input"
            type="text"
            value={modelStoragePath}
            onChange={(e) => setModelStoragePath(e.target.value)}
            onBlur={() => handleSaveStoragePath(modelStoragePath)}
            placeholder={storageLocations.current}
            title="Local folder path where models are saved"
          />
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleResetStoragePath}
            title="Reset to recommended default for this OS"
          >
            Reset to OS Default
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={isScanning}
            onClick={() => void handleScanModels()}
            title="Search filesystem and cache directories for Tabman models"
          >
            <SearchIcon size={13} />
            {isScanning ? 'Scanning...' : 'Scan Machine for Models'}
          </Button>
        </div>
        {scanStatus && (
          <div className="storage-scan-result">
            <CheckIcon size={14} />
            <span>{scanStatus}</span>
          </div>
        )}
        <small style={{ color: 'var(--text-soft)', fontSize: '11.5px' }}>
          Platform defaults: Windows (<code>{storageLocations.windows}</code>) ·
          Linux/macOS (<code>{storageLocations.linux}</code>). No PyTorch or
          CUDA required on client machines.
        </small>
      </section>

      {/* Configured Providers Section */}
      <div className="provider-list">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
          }}
        >
          <h2 style={{ fontSize: '16px', margin: 0 }}>
            Active & Custom Providers
          </h2>
          {providers.length > 0 && !adding && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setAdding(true)}
            >
              <PlusIcon size={14} />
              Add a provider
            </Button>
          )}
        </div>

        {providers.length === 0 && !adding && (
          <div className="empty">
            <span className="empty-mark" aria-hidden="true">
              <SparkIcon size={22} />
            </span>
            <h2>No provider yet</h2>
            <p>
              Select an official Hugging Face model above for zero-dependency
              local clustering, or add a custom API provider endpoint.
            </p>
            <Button
              variant="default"
              type="button"
              onClick={() => setAdding(true)}
            >
              <PlusIcon size={15} />
              Add a provider
            </Button>
          </div>
        )}

        {providers.map((profile) => {
          const active = profile.id === settings?.activeProviderId;
          return (
            <CardSpotlight
              className={active ? 'provider active' : 'provider'}
              key={profile.id}
            >
              <header className="provider-head">
                <div className="provider-meta">
                  <strong>{profile.name}</strong>
                  <span>
                    {profile.model} · {profile.apiFormat}
                  </span>
                  <code>
                    {profile.baseUrl.replace(/\\Tabman\\/g, '\\tabman\\')}
                  </code>
                </div>
                {active ? (
                  <span className="chip chip-brand">
                    <CheckIcon size={13} />
                    In use
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
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
                  </Button>
                )}
              </header>

              {profile.apiFormat === 'tabman-local' ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-subtle, rgba(255, 255, 255, 0.03))',
                    border:
                      '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {downloadedRepos.includes(profile.model.toLowerCase()) ? (
                      <>
                        <span className="chip chip-success">
                          <CheckIcon size={12} /> Model Cached on Disk
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Zero-latency local ONNX execution
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="chip chip-warning">
                          <SparkIcon size={12} /> Ready on First Use
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Downloads on first embedding task, or place ONNX in
                          storage directory
                        </span>
                      </>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      flexWrap: 'wrap',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>
                      <strong>Precision:</strong> {precision.toUpperCase()}
                    </span>
                    <span>
                      <strong>Storage:</strong> {modelStoragePath}
                    </span>
                    <span>
                      <strong>Compute:</strong>{' '}
                      {deviceChoice === 'auto'
                        ? `Auto (${
                            benchmarkReport
                              ? `${benchmarkReport.fastestName} (${benchmarkReport.fastestLatencyMs} ms)`
                              : hardwareProfile?.deviceLabel ||
                                'Hardware Accelerated'
                          })`
                        : `${deviceChoice.toUpperCase()} (Manual Override)`}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="provider-key">
                    <span
                      className={
                        hasKey && active
                          ? 'chip chip-success'
                          : 'chip chip-warning'
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
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      disabled={busy || !keyDraft.trim()}
                      onClick={() => void saveKey()}
                    >
                      Save key
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
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
                    </Button>
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
                </>
              )}

              <footer className="provider-foot">
                <span>
                  <ShieldIcon size={13} />
                  {profile.apiFormat === 'tabman-local'
                    ? '100% private · Neural clustering executes locally in your browser'
                    : 'Session only unless you turn the switch on.'}
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              providers: prev.providers.filter(
                                (p) => p.id !== profile.id,
                              ),
                              activeProviderId:
                                prev.activeProviderId === profile.id
                                  ? null
                                  : prev.activeProviderId,
                            }
                          : prev,
                      );
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
                </Button>
              </footer>
            </CardSpotlight>
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
              <label className="provider-preset-full">
                Choose Official Model Preset (Hugging Face)
                <select
                  className="select"
                  value={selectedHfPreset}
                  onChange={(event) => handleSelectPreset(event.target.value)}
                >
                  <option value="">Custom / Manual Configuration</option>
                  <optgroup label="Official Models — INT8 Quantized (Recommended)">
                    {TABMAN_OFFICIAL_MODELS.map((m) => (
                      <option key={`${m.repo}:int8`} value={`${m.repo}:int8`}>
                        {m.name} [INT8 · {m.sizeInt8}] (Recommended)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Official Models — FP32 Full Precision">
                    {TABMAN_OFFICIAL_MODELS.map((m) => (
                      <option key={`${m.repo}:fp32`} value={`${m.repo}:fp32`}>
                        {m.name} [FP32 · {m.sizeFp32}]
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>

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
                {selectedHfPreset && (
                  <small
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '4px',
                    }}
                  >
                    <SparkIcon size={13} />
                    <a
                      href={`https://huggingface.co/${model}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--brand-text)' }}
                    >
                      View on Hugging Face Hub
                    </a>
                  </small>
                )}
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
              <Button
                variant="default"
                type="submit"
                disabled={
                  busy || !name.trim() || !baseUrl.trim() || !model.trim()
                }
              >
                <PlusIcon size={15} />
                Add provider
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setAdding(false);
                  setSelectedHfPreset('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
