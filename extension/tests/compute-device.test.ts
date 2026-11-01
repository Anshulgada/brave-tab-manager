import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectBestComputeDevice,
  detectHardwareProfile,
  PINNED_EMBEDDING_MODELS,
  TABMAN_OFFICIAL_MODELS,
  verifySha256,
} from '../src/compute-device';

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
});
