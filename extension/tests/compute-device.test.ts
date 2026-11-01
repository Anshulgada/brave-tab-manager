import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectBestComputeDevice,
  detectHardwareProfile,
  PINNED_EMBEDDING_MODELS,
  resolveEffectiveDevice,
  resolveGpuPowerPreference,
  TABMAN_OFFICIAL_MODELS,
  verifySha256,
} from '../src/compute-device';
import {
  benchmarkBatchedWorkload,
  benchmarkCpuWorkload,
  computeDynamicBatchPlan,
  getCachedBenchmarkReport,
  getNPUSystolicBucket,
  type HardwareBenchmarkReport,
  runHardwareBenchmark,
} from '../src/hardware-benchmark';

describe('compute device and model specs', () => {
  it('pins only embeddinggemma-2 models and rejects 300m', () => {
    const keys = Object.keys(PINNED_EMBEDDING_MODELS);
    expect(keys).toContain('embeddinggemma-2-270m');
    expect(keys).toContain('embeddinggemma-2-440m');
    expect(keys).toContain('embeddinggemma-2-740m');
    expect(keys).not.toContain('embeddinggemma-300m');

    for (const [key, spec] of Object.entries(PINNED_EMBEDDING_MODELS)) {
      expect(key).toMatch(/^embeddinggemma-2-/);
      expect(spec.huggingFaceRepo).toBe('google/embeddinggemma-2');
      expect(spec.mrlDimensions.length).toBeGreaterThan(0);
      expect(spec.targetDevice.length).toBeGreaterThan(0);
    }
  });

  it('verifies SHA-256 checksums correctly', async () => {
    const data = new TextEncoder().encode('hello world').buffer;
    // Known SHA-256 of "hello world"
    const expected =
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'; // pragma: allowlist secret

    const valid = await verifySha256(data, expected);
    expect(valid).toBe(true);

    const invalid = await verifySha256(data, 'wronghash');
    expect(invalid).toBe(false);
  });
});

describe('hardware acceleration detection', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('detects WebGPU as primary when navigator.gpu is available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({}),
        },
        ml: {
          createContext: vi.fn().mockResolvedValue({ deviceType: 'npu' }),
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await detectBestComputeDevice();
    expect(result.device).toBe('webgpu');
    expect(result.label).toContain('GPU');
  });

  it('detects NPU when WebGPU is absent but WebNN ml.createContext succeeds', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ml: {
          createContext: vi.fn().mockResolvedValue({ deviceType: 'npu' }),
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await detectBestComputeDevice();
    expect(result.device).toBe('npu');
    expect(result.label).toContain('NPU');
  });

  it('falls back to CPU WASM SIMD when neither GPU nor NPU is available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const result = await detectBestComputeDevice();
    expect(result.device).toBe('cpu');
    expect(result.label).toContain('CPU');
  });

  it('detects hardware profile and generates recommendations', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        hardwareConcurrency: 16,
        deviceMemory: 32,
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({
            requestAdapterInfo: vi
              .fn()
              .mockResolvedValue({ description: 'NVIDIA RTX 4080' }),
          }),
        },
      },
      configurable: true,
      writable: true,
    });

    const profile = await detectHardwareProfile();
    expect(profile.device).toBe('webgpu');
    expect(profile.gpuName).toBe('NVIDIA RTX 4080');
    expect(profile.cpuThreads).toBe(16);
    expect(profile.ramGb).toBe(32);
    expect(profile.recommendedPrecision).toBe('int8');
    expect(profile.recommendationReason).toContain('NVIDIA RTX 4080');
  });

  it('official models include both INT8 and FP32 size specs', () => {
    expect(TABMAN_OFFICIAL_MODELS.length).toBe(3);
    for (const model of TABMAN_OFFICIAL_MODELS) {
      expect(model.sizeInt8).toMatch(/MB|GB/);
      expect(model.sizeFp32).toMatch(/MB|GB/);
      expect(model.repo).toMatch(/^Anshulgada\/tabman-embeddinggemma-2-/);
    }
  });

  it('resolves auto vs user-overridden compute devices', () => {
    expect(resolveEffectiveDevice('auto', 'webgpu')).toBe('webgpu');
    expect(resolveEffectiveDevice('auto', 'npu')).toBe('npu');
    expect(resolveEffectiveDevice('auto', 'cpu')).toBe('cpu');
    expect(resolveEffectiveDevice('cpu', 'webgpu')).toBe('cpu');
    expect(resolveEffectiveDevice('npu', 'webgpu')).toBe('npu');
    expect(resolveEffectiveDevice('webgpu', 'cpu')).toBe('webgpu');
    expect(resolveEffectiveDevice('webgpu-discrete', 'cpu')).toBe('webgpu');
    expect(resolveEffectiveDevice('webgpu-integrated', 'cpu')).toBe('webgpu');
  });

  it('resolves GPU power preferences for discrete vs integrated overrides', () => {
    expect(resolveGpuPowerPreference('webgpu-discrete')).toBe(
      'high-performance',
    );
    expect(resolveGpuPowerPreference('webgpu-integrated')).toBe('low-power');
    expect(resolveGpuPowerPreference('webgpu')).toBeUndefined();
    expect(resolveGpuPowerPreference('cpu')).toBeUndefined();
  });

  it('resolves auto target based on empirical hardware benchmark winner', () => {
    const mockReport: HardwareBenchmarkReport = {
      timestamp: Date.now(),
      fastestChoice: 'webgpu-discrete',
      fastestName: 'NVIDIA RTX 4080',
      fastestLatencyMs: 1.8,
      results: [
        {
          id: 'webgpu-discrete',
          name: 'NVIDIA RTX 4080',
          category: 'dgpu',
          latencyMs: 1.8,
          available: true,
        },
        {
          id: 'cpu',
          name: 'CPU SIMD',
          category: 'cpu',
          latencyMs: 18.5,
          available: true,
        },
      ],
    };

    expect(resolveEffectiveDevice('auto', 'cpu', mockReport)).toBe('webgpu');
    expect(resolveGpuPowerPreference('auto', mockReport)).toBe(
      'high-performance',
    );

    const cpuWinnerReport: HardwareBenchmarkReport = {
      timestamp: Date.now(),
      fastestChoice: 'cpu',
      fastestName: 'CPU SIMD',
      fastestLatencyMs: 15.0,
      results: [
        {
          id: 'cpu',
          name: 'CPU SIMD',
          category: 'cpu',
          latencyMs: 15.0,
          available: true,
        },
      ],
    };
    expect(resolveEffectiveDevice('auto', 'webgpu', cpuWinnerReport)).toBe(
      'cpu',
    );
  });

  it('executes CPU benchmark workload and caches benchmark report', async () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });

    const latency = benchmarkCpuWorkload(2);
    expect(latency).toBeGreaterThan(0);

    const report = await runHardwareBenchmark(true);
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.fastestLatencyMs).toBeGreaterThan(0);
    expect(getCachedBenchmarkReport()).not.toBeNull();
  });

  it('computes dynamic batch plans optimized by tab count and silicon target', () => {
    // 1 tab: single item, no chunking needed
    const single = computeDynamicBatchPlan(1, 'cpu');
    expect(single.optimalBatchSize).toBe(1);
    expect(single.batchChunks).toEqual([1]);
    expect(single.speedupFactor).toBe(1.0);

    // 10 tabs on CPU: single chunk of 10
    const smallCpu = computeDynamicBatchPlan(10, 'cpu');
    expect(smallCpu.optimalBatchSize).toBe(10);
    expect(smallCpu.batchChunks).toEqual([10]);
    expect(smallCpu.speedupFactor).toBeGreaterThan(1.5);

    // 35 tabs on CPU: chunks of [32, 3] (2 passes beats 3 passes [16, 16, 3])
    const largeCpu = computeDynamicBatchPlan(35, 'cpu');
    expect(largeCpu.optimalBatchSize).toBe(32);
    expect(largeCpu.batchChunks).toEqual([32, 3]);

    // 70 tabs on dGPU: chunks of [64, 6] (dGPU maxChunk is 64; 2 passes beats 3 passes [32, 32, 6])
    const largeDgpu = computeDynamicBatchPlan(70, 'dgpu');
    expect(largeDgpu.optimalBatchSize).toBe(64);
    expect(largeDgpu.batchChunks).toEqual([64, 6]);

    // 100 tabs on dGPU: 64 first, then remainder 36 in 1 pass -> [64, 36] (2 passes, not 3 passes [64, 32, 4])
    const hundredDgpu = computeDynamicBatchPlan(100, 'dgpu');
    expect(hundredDgpu.optimalBatchSize).toBe(64);
    expect(hundredDgpu.batchChunks).toEqual([64, 36]);

    // 53 tabs on CPU: 32 first, then remainder 21 in 1 pass -> [32, 21] (2 passes, not 3 passes [32, 16, 5])
    const fiftyThree = computeDynamicBatchPlan(53, 'cpu');
    expect(fiftyThree.optimalBatchSize).toBe(32);
    expect(fiftyThree.batchChunks).toEqual([32, 21]);

    // 25 tabs on NPU/CPU: single-pass direct [25] beats [16, 9] (avoids second 270MB DRAM fetch)
    const npuPlan = computeDynamicBatchPlan(25, 'npu');
    expect(npuPlan.optimalBatchSize).toBe(25);
    expect(npuPlan.batchChunks).toEqual([25]);
    expect(npuPlan.npuBuckets).toEqual([32]); // padded to static systolic bucket 32 in 1 pass
    expect(npuPlan.speedupFactor).toBeGreaterThan(5.0);

    const cpuPlan25 = computeDynamicBatchPlan(25, 'cpu');
    expect(cpuPlan25.optimalBatchSize).toBe(25);
    expect(cpuPlan25.batchChunks).toEqual([25]);

    // 50 tabs on NPU: 32 first, then remainder 18 -> [32, 18] (2 passes: bucket 32 and bucket 32)
    const npuFifty = computeDynamicBatchPlan(50, 'npu');
    expect(npuFifty.optimalBatchSize).toBe(32);
    expect(npuFifty.batchChunks).toEqual([32, 18]);
    expect(npuFifty.npuBuckets).toEqual([32, 32]);

    // Static power-of-2 systolic bucket mappings for NPU zero-padding
    expect(getNPUSystolicBucket(1)).toBe(1);
    expect(getNPUSystolicBucket(2)).toBe(2);
    expect(getNPUSystolicBucket(3)).toBe(4);
    expect(getNPUSystolicBucket(7)).toBe(8);
    expect(getNPUSystolicBucket(12)).toBe(16);
    expect(getNPUSystolicBucket(18)).toBe(32);
    expect(getNPUSystolicBucket(32)).toBe(32);
  });

  it('empirically verifies batching workload execution across batch sizes', () => {
    const single = benchmarkBatchedWorkload(1, 2);
    const batched16 = benchmarkBatchedWorkload(16, 2);
    expect(single.totalMs).toBeGreaterThan(0);
    expect(batched16.totalMs).toBeGreaterThan(0);
    expect(single.batchSize).toBe(1);
    expect(batched16.batchSize).toBe(16);
    expect(single.throughput).toBeGreaterThan(0);
    expect(batched16.throughput).toBeGreaterThan(0);
  });
});
