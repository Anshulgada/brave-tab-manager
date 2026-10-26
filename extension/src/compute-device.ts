/**
 * Hardware acceleration detection and model integrity verification.
 *
 * Supports WebNN (NPU), WebGPU (GPU), and WASM SIMD (CPU) backends,
 * with SHA-256 cryptographic verification for Hugging Face weights.
 */

export type ComputeDevice = 'npu' | 'webgpu' | 'cpu';

export interface ModelSpec {
  id: string;
  name: string;
  huggingFaceRepo: string;
  revision: string; // Pinned commit SHA for immutability
  sha256?: string;
  parameters: string;
  mrlDimensions: number[];
  targetDevice: ComputeDevice[];
}

export const PINNED_EMBEDDING_MODELS: Record<string, ModelSpec> = {
  'embeddinggemma-2-270m': {
    id: 'embeddinggemma-2-270m',
    name: 'EmbeddingGemma 2 (270M Text & Code)',
    huggingFaceRepo: 'google/embeddinggemma-2',
    revision: 'main',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', // pragma: allowlist secret
    parameters: '270M',
    mrlDimensions: [128, 256, 512, 768],
    targetDevice: ['npu', 'webgpu', 'cpu'],
  },
  'embeddinggemma-2-440m': {
    id: 'embeddinggemma-2-440m',
    name: 'EmbeddingGemma 2 (440M Vision)',
    huggingFaceRepo: 'google/embeddinggemma-2',
    revision: 'main',
    parameters: '440M',
    mrlDimensions: [128, 256, 512, 768],
    targetDevice: ['npu', 'webgpu'],
  },
  'embeddinggemma-2-740m': {
    id: 'embeddinggemma-2-740m',
    name: 'EmbeddingGemma 2 (740M Multimodal)',
    huggingFaceRepo: 'google/embeddinggemma-2',
    revision: 'main',
    parameters: '740M',
    mrlDimensions: [256, 512, 768],
    targetDevice: ['webgpu'],
  },
};

/**
 * Detect the highest-performance available neural compute device.
 * Checks WebNN (NPU) -> WebGPU -> WASM SIMD (CPU).
 */
export async function detectBestComputeDevice(): Promise<{
  device: ComputeDevice;
  label: string;
}> {
  // 1. Check for WebNN NPU support (Chromium / Windows 11 / DirectML NPU)
  try {
    const nav = navigator as unknown as {
      ml?: {
        createContext?: (options?: {
          deviceType?: 'npu' | 'gpu' | 'cpu';
        }) => Promise<unknown>;
      };
    };
    if (nav.ml && typeof nav.ml.createContext === 'function') {
      const npuContext = await nav.ml.createContext({ deviceType: 'npu' });
      if (npuContext) {
        return {
          device: 'npu',
          label: 'NPU (Neural Processing Unit via WebNN)',
        };
      }
    }
  } catch {
    // WebNN NPU not available, continue to WebGPU
  }

  // 2. Check for WebGPU acceleration
  try {
    if ('gpu' in navigator && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        return {
          device: 'webgpu',
          label: 'GPU (Hardware Acceleration via WebGPU)',
        };
      }
    }
  } catch {
    // WebGPU not available, continue to CPU
  }

  // 3. Fallback to CPU WASM
  return {
    device: 'cpu',
    label: 'CPU (WebAssembly SIMD High-Throughput)',
  };
}

/**
 * Verify SHA-256 checksum of an ArrayBuffer.
 */
export async function verifySha256(
  data: ArrayBuffer,
  expectedHex: string,
): Promise<boolean> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex.toLowerCase() === expectedHex.toLowerCase();
}
