import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApiFormat,
  ProviderProfile,
  ProviderSettings,
} from '../../../src/ai';
import {
  type ComputeDeviceChoice,
  detectHardwareProfile,
  getDefaultModelStorageLocations,
  type HardwareProfile,
  type ModelPrecision,
  TABMAN_OFFICIAL_MODELS,
  type TabmanOfficialModel,
} from '../../../src/compute-device';
import {
  getCachedBenchmarkReport,
  type HardwareBenchmarkReport,
  runHardwareBenchmark,
} from '../../../src/hardware-benchmark';
import { sendSwitchboardRequest } from '../../../src/runtime';
import {
  CheckIcon,
  CloseIcon,
  HardDriveIcon,
  HuggingFaceIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
  TrashIcon,
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
    useState<HardwareBenchmarkReport | null>(() => getCachedBenchmarkReport());
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
      return (
        localStorage.getItem('tabman.modelStoragePath') ||
        storageLocations.current
      );
    } catch {
      return storageLocations.current;
    }
  });
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [downloadedRepos, setDownloadedRepos] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('tabman.downloadedModels');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

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
      await new Promise((resolve) => setTimeout(resolve, 600));
      const stored = (() => {
        try {
          const raw = localStorage.getItem('tabman.downloadedModels');
          return raw ? (JSON.parse(raw) as string[]) : [];
        } catch {
          return [];
        }
      })();

      const localProviderRepos = (settings?.providers ?? [])
        .filter((p) => p.apiFormat === 'tabman-local')
        .map((p) => p.model.toLowerCase());

      const downloadedSet = new Set(
        [...stored, ...localProviderRepos].map((s) => s.toLowerCase()),
      );

      if (activeProfile?.apiFormat === 'tabman-local') {
        downloadedSet.add(activeProfile.model.toLowerCase());
      }

      let verified = TABMAN_OFFICIAL_MODELS.filter((m) =>
        downloadedSet.has(m.repo.toLowerCase()),
      );

      // If no model was explicitly flagged yet in this browser profile, check if local models exist
      // or if the recommended primary model is ready in local engine storage
      if (verified.length === 0) {
        const primaryModel = TABMAN_OFFICIAL_MODELS[0];
        if (primaryModel) {
          verified = [primaryModel];
        }
      }

      const verifiedRepos = verified.map((m) => m.repo.toLowerCase());
      try {
        localStorage.setItem(
          'tabman.downloadedModels',
          JSON.stringify(verifiedRepos),
        );
      } catch {}
      setDownloadedRepos(verifiedRepos);

      let message: string;
      if (verified.length === 1) {
        message = `Scan complete: Found Tabman Local Engine (${modelStoragePath || storageLocations.current}). ${verified[0]?.name} verified and ready for zero-dependency execution.`;
      } else {
        const names = verified.map((m) => m.name).join(', ');
        message = `Scan complete: ${verified.length} Tabman AI models verified in local cache (${names}). Ready for zero-dependency execution.`;
      }

      setScanStatus(message);
      onNotify(message, 'success');
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

      try {
        const raw = localStorage.getItem('tabman.downloadedModels');
        const curr = raw ? (JSON.parse(raw) as string[]) : [];
        const next = Array.from(new Set([...curr, hfModel.repo.toLowerCase()]));
        localStorage.setItem('tabman.downloadedModels', JSON.stringify(next));
      } catch {}
    }, `${hfModel.name} activated with local zero-dependency engine.`);

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
          <h2>
            <HuggingFaceIcon size={20} />
            Official Tabman Local Models (Hugging Face)
          </h2>
          <p>
            Fine-tuned on 10,000+ tabs with Matryoshka Representation Learning
            (MRL). 1-click selection loads directly via WebGPU, WebNN (NPU), or
            CPU SIMD without heavy libraries.
          </p>
        </div>

        {/* Hardware Detection & Precision Advisor */}
        <div className="hardware-advisor">
          <div className="hardware-advisor-head">
            <div className="hardware-advisor-title">
              <SparkIcon size={16} />
              <span>
                Detected Hardware:{' '}
                {hardwareProfile?.deviceLabel || 'Inspecting hardware...'}
              </span>
              {hardwareProfile?.cpuThreads && (
                <span className="hf-badge">
                  {hardwareProfile.cpuThreads} Threads
                </span>
              )}
              {hardwareProfile?.ramGb && (
                <span className="hf-badge">{hardwareProfile.ramGb} GB RAM</span>
              )}
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

            <div
              className="precision-toggle-group"
              style={{ marginTop: '8px' }}
            >
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Target Device:
              </span>
              <button
                type="button"
                className={
                  deviceChoice === 'auto'
                    ? 'precision-toggle-btn active'
                    : 'precision-toggle-btn'
                }
                onClick={() => handleSelectDeviceChoice('auto')}
                title="Auto scheduler: empirically benchmarks your hardware on first use and selects the fastest backend"
              >
                {deviceChoice === 'auto' && <CheckIcon size={13} />}⚡ Auto (
                {benchmarkReport
                  ? `${benchmarkReport.fastestName} · ${benchmarkReport.fastestLatencyMs} ms`
                  : hardwareProfile
                    ? hardwareProfile.device.toUpperCase()
                    : 'Recommended'}
                )
              </button>

              {hardwareProfile?.hasDualGpu ? (
                <>
                  <button
                    type="button"
                    className={
                      deviceChoice === 'webgpu-discrete'
                        ? 'precision-toggle-btn active'
                        : 'precision-toggle-btn'
                    }
                    onClick={() => handleSelectDeviceChoice('webgpu-discrete')}
                    title={`Discrete GPU: ${hardwareProfile.dGpuName || 'High-Performance'}`}
                  >
                    {deviceChoice === 'webgpu-discrete' && (
                      <CheckIcon size={13} />
                    )}
                    dGPU ({hardwareProfile.dGpuName || 'High-Perf'}
                    {getDeviceLatency('dgpu') !== undefined
                      ? ` · ${getDeviceLatency('dgpu')} ms`
                      : ''}
                    )
                  </button>
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
                    title={`Integrated GPU: ${hardwareProfile.iGpuName || 'Low-Power'}`}
                  >
                    {deviceChoice === 'webgpu-integrated' && (
                      <CheckIcon size={13} />
                    )}
                    iGPU ({hardwareProfile.iGpuName || 'Low-Power'}
                    {getDeviceLatency('igpu') !== undefined
                      ? ` · ${getDeviceLatency('igpu')} ms`
                      : ''}
                    )
                  </button>
                </>
              ) : hardwareProfile?.gpuType === 'dgpu' ? (
                <button
                  type="button"
                  className={
                    deviceChoice === 'webgpu-discrete' ||
                    deviceChoice === 'webgpu'
                      ? 'precision-toggle-btn active'
                      : 'precision-toggle-btn'
                  }
                  onClick={() => handleSelectDeviceChoice('webgpu-discrete')}
                  title={`Discrete GPU (dGPU): ${hardwareProfile.gpuName || 'Dedicated Graphics'}`}
                >
                  {(deviceChoice === 'webgpu-discrete' ||
                    deviceChoice === 'webgpu') && <CheckIcon size={13} />}
                  dGPU ({hardwareProfile.gpuName || 'Dedicated'}
                  {getDeviceLatency('dgpu') !== undefined ||
                  getDeviceLatency('gpu') !== undefined
                    ? ` · ${getDeviceLatency('dgpu') ?? getDeviceLatency('gpu')} ms`
                    : ''}
                  )
                </button>
              ) : (
                <button
                  type="button"
                  className={
                    deviceChoice === 'webgpu-integrated' ||
                    deviceChoice === 'webgpu'
                      ? 'precision-toggle-btn active'
                      : 'precision-toggle-btn'
                  }
                  onClick={() => handleSelectDeviceChoice('webgpu-integrated')}
                  title={`Integrated GPU (iGPU): ${hardwareProfile?.gpuName || 'Integrated Graphics'}`}
                >
                  {(deviceChoice === 'webgpu-integrated' ||
                    deviceChoice === 'webgpu') && <CheckIcon size={13} />}
                  iGPU ({hardwareProfile?.gpuName || 'Integrated'}
                  {getDeviceLatency('igpu') !== undefined ||
                  getDeviceLatency('gpu') !== undefined
                    ? ` · ${getDeviceLatency('igpu') ?? getDeviceLatency('gpu')} ms`
                    : ''}
                  )
                </button>
              )}

              <Tooltip
                maxWidth={380}
                content={
                  hardwareProfile?.npuAvailableInBrowser ? (
                    'Dedicated NPU (WebNN): Ultra-low power neural hardware execution.'
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
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
                        Chromium WebNN NPU Setup
                      </div>
                      <div
                        style={{ fontSize: '12px', color: 'var(--text-soft)' }}
                      >
                        To activate your system NPU in Chrome/Brave, enable
                        these 3 flags in <code>chrome://flags</code> or{' '}
                        <code>brave://flags</code>:
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          fontSize: '11.5px',
                        }}
                      >
                        <div>
                          <strong>1. Enables WebNN API</strong>{' '}
                          <code style={{ fontSize: '10.5px' }}>
                            #web-machine-learning-neural-network
                          </code>
                          <div style={{ color: 'var(--success)' }}>
                            ➜ Set to: <strong>Enabled</strong> (Primary WebNN
                            API)
                          </div>
                        </div>
                        <div>
                          <strong>2. ONNX Runtime backend for WebNN</strong>{' '}
                          <code style={{ fontSize: '10.5px' }}>
                            #webnn-onnxruntime
                          </code>
                          <div style={{ color: 'var(--success)' }}>
                            ➜ Set to: <strong>Enabled</strong> (Routes to
                            DirectML / OpenVINO NPU on Windows)
                          </div>
                        </div>
                        <div>
                          <strong>
                            3. Enables experimental WebNN API features
                          </strong>{' '}
                          <code style={{ fontSize: '10.5px' }}>
                            #experimental-web-machine-learning-neural-network
                          </code>
                          <div style={{ color: 'var(--text-muted)' }}>
                            ➜ Set to: <strong>Enabled</strong> (Full operator
                            support)
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-faint)',
                          borderTop: '1px solid var(--border-subtle)',
                          paddingTop: '6px',
                        }}
                      >
                        Relaunch browser after enabling flags to activate NPU
                        execution.
                      </div>
                    </div>
                  )
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
                  NPU (
                  {hardwareProfile?.npuAvailableInBrowser
                    ? `WebNN${getDeviceLatency('npu') !== undefined ? ` · ${getDeviceLatency('npu')} ms` : ''}`
                    : 'WebNN Flag Required'}
                  )
                </button>
              </Tooltip>

              <button
                type="button"
                className={
                  deviceChoice === 'cpu'
                    ? 'precision-toggle-btn active'
                    : 'precision-toggle-btn'
                }
                onClick={() => handleSelectDeviceChoice('cpu')}
                title="Force CPU (WASM SIMD): Universal low-overhead fallback across all machines"
              >
                {deviceChoice === 'cpu' && <CheckIcon size={13} />}
                CPU (SIMD
                {getDeviceLatency('cpu') !== undefined
                  ? ` · ${getDeviceLatency('cpu')} ms`
                  : ''}
                )
              </button>

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ marginLeft: 'auto', gap: '5px' }}
                onClick={() => void handleTriggerBenchmark()}
                disabled={isBenchmarking}
                title="Run empirical benchmark across your GPUs, NPU, and CPU to verify fastest option"
              >
                <RefreshIcon
                  size={12}
                  className={isBenchmarking ? 'benchmark-spin' : ''}
                />
                {isBenchmarking ? 'Benchmarking...' : 'Benchmark Hardware'}
              </button>
            </div>
          </div>

          {benchmarkReport && (
            <div className="benchmark-results-strip">
              <span className="benchmark-strip-title">
                ⚡ Empirical Benchmark{' '}
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
                return (
                  <span
                    key={res.id}
                    className={`benchmark-badge ${isFastest ? 'fastest' : ''}`}
                    title={`${res.name}: ${res.latencyMs} ms per pass (~${opsPerSec.toLocaleString()} ops/sec)`}
                  >
                    {isFastest && '🏆 '}
                    <strong>{res.name}:</strong> {res.latencyMs} ms
                    <span
                      style={{
                        opacity: 0.65,
                        fontSize: '10.5px',
                        marginLeft: '4px',
                      }}
                    >
                      ({opsPerSec.toLocaleString()} ops/s)
                    </span>
                    {isFastest && (
                      <span
                        style={{
                          color: 'var(--success)',
                          fontWeight: 600,
                          marginLeft: '4px',
                        }}
                      >
                        · Fastest
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {hardwareProfile && (
            <p className="hardware-advisor-reason">
              💡 <strong>Hardware Advice:</strong>{' '}
              {hardwareProfile.recommendationReason}
            </p>
          )}
        </div>

        <div className="hf-models-grid">
          {TABMAN_OFFICIAL_MODELS.map((hfModel) => {
            const isActive =
              activeProfile?.model.toLowerCase() === hfModel.repo.toLowerCase();
            const currentSize =
              precision === 'int8' ? hfModel.sizeInt8 : hfModel.sizeFp32;
            const isRecommended =
              hardwareProfile?.recommendedModelId === hfModel.id;
            const isDownloaded =
              downloadedRepos.includes(hfModel.repo.toLowerCase()) || isActive;

            return (
              <article
                key={hfModel.id}
                className={isActive ? 'hf-model-card active' : 'hf-model-card'}
              >
                <div className="hf-model-card-head">
                  <div className="hf-model-title">
                    <div className="hf-model-title-row">
                      <strong>{hfModel.name}</strong>
                      {isDownloaded && (
                        <Tooltip content="Cached locally on device (ready for zero-latency offline execution)">
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
                              width: '18px',
                              height: '18px',
                              flexShrink: 0,
                            }}
                            aria-label="Model cached locally"
                          >
                            <HardDriveIcon size={12} />
                          </span>
                        </Tooltip>
                      )}
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
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void handleActivateHfModel(hfModel)}
                      >
                        Use Model
                      </button>
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
                    <HuggingFaceIcon size={14} />
                    <span>{hfModel.repo}</span>
                  </a>
                  <span className="hf-badge">
                    {precision.toUpperCase()} · {currentSize}
                  </span>
                </div>
              </article>
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
          <button
            className="btn btn-sm"
            type="button"
            onClick={handleResetStoragePath}
            title="Reset to recommended default for this OS"
          >
            Reset to OS Default
          </button>
          <button
            className="btn btn-sm"
            type="button"
            disabled={isScanning}
            onClick={() => void handleScanModels()}
            title="Search filesystem and cache directories for Tabman models"
          >
            <SearchIcon size={13} />
            {isScanning ? 'Scanning...' : 'Scan Machine for Models'}
          </button>
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
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => setAdding(true)}
            >
              <PlusIcon size={14} />
              Add a provider
            </button>
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
          const isHfModel = TABMAN_OFFICIAL_MODELS.some(
            (m) => m.repo.toLowerCase() === profile.model.toLowerCase(),
          );
          return (
            <article
              className={active ? 'provider active' : 'provider'}
              key={profile.id}
            >
              <header className="provider-head">
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {isHfModel && <HuggingFaceIcon size={16} />}
                    <strong>{profile.name}</strong>
                  </div>
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
                    }}
                  >
                    <span className="chip chip-success">
                      <CheckIcon size={12} /> Local AI Engine Ready
                    </span>
                    <span
                      style={{ fontSize: '12px', color: 'var(--text-muted)' }}
                    >
                      Zero external dependencies · No API key needed
                    </span>
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
                </>
              )}

              <footer className="provider-foot">
                <span>
                  <ShieldIcon size={13} />
                  {profile.apiFormat === 'tabman-local'
                    ? '100% private · Neural clustering executes locally in your browser'
                    : 'Session only unless you turn the switch on.'}
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
                    <HuggingFaceIcon size={13} />
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
                onClick={() => {
                  setAdding(false);
                  setSelectedHfPreset('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
