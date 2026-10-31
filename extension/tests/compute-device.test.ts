import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  detectBestComputeDevice,
  PINNED_EMBEDDING_MODELS,
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

  it('detects NPU when WebNN ml.createContext succeeds', async () => {
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

  it('detects WebGPU when WebNN is absent but navigator.gpu is available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({}),
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await detectBestComputeDevice();
    expect(result.device).toBe('webgpu');
    expect(result.label).toContain('GPU');
  });

  it('falls back to CPU WASM SIMD when neither NPU nor WebGPU is available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });

    const result = await detectBestComputeDevice();
    expect(result.device).toBe('cpu');
    expect(result.label).toContain('CPU');
  });
});
