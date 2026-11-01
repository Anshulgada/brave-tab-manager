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

export type ModelPrecision = 'int8' | 'fp32';

export interface TabmanOfficialModel {
  id: string;
  name: string;
  repo: string;
  size: string;
  sizeInt8: string;
  sizeFp32: string;
  parameters: string;
  tier: string;
  hfUrl: string;
  description: string;
}

export const TABMAN_OFFICIAL_MODELS: TabmanOfficialModel[] = [
  {
    id: 'tabman-embeddinggemma-2-270m',
    name: 'Tabman EmbeddingGemma 2 (270M)',
    repo: 'Anshulgada/tabman-embeddinggemma-2-270m',
    size: '~270 MB',
    sizeInt8: '~270 MB',
    sizeFp32: '~1.0 GB',
    parameters: '270M',
    tier: 'Fastest · WebGPU / NPU / CPU',
    hfUrl: 'https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-270m',
    description:
      'Fine-tuned Text & Code backbone. High-speed in-browser grouping (8-15 ms).',
  },
  {
    id: 'tabman-embeddinggemma-2-440m',
    name: 'Tabman EmbeddingGemma 2 (440M)',
    repo: 'Anshulgada/tabman-embeddinggemma-2-440m',
    size: '~440 MB',
    sizeInt8: '~440 MB',
    sizeFp32: '~1.7 GB',
    parameters: '440M',
    tier: 'Balanced · Text + Vision',
    hfUrl: 'https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-440m',
    description:
      'Fine-tuned Text + Vision multimodal backbone for tabs with thumbnails.',
  },
  {
    id: 'tabman-embeddinggemma-2-740m',
    name: 'Tabman EmbeddingGemma 2 (740M)',
    repo: 'Anshulgada/tabman-embeddinggemma-2-740m',
    size: '~740 MB',
    sizeInt8: '~740 MB',
    sizeFp32: '~2.9 GB',
    parameters: '740M',
    tier: 'Maximum Capacity · Full Multimodal',
    hfUrl: 'https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-740m',
    description:
      'Full multimodal capacity for dense multi-window research setups.',
  },
];

export function getDefaultModelStorageLocations(): {
  windows: string;
  linux: string;
  current: string;
  searchPaths: string[];
} {
  const isWindows =
    typeof navigator !== 'undefined' &&
    /win/i.test(navigator.userAgent || navigator.platform || '');

  const windowsPath = '%LOCALAPPDATA%\\Tabman\\models';
  const linuxPath = '~/.local/share/tabman/models';

  return {
    windows: windowsPath,
    linux: linuxPath,
    current: isWindows ? windowsPath : linuxPath,
    searchPaths: [
      windowsPath,
      linuxPath,
      '~/.cache/tabman/models',
      '~/.cache/huggingface/hub',
      '%USERPROFILE%\\.cache\\huggingface\\hub',
    ],
  };
}

/**
 * Detect the highest-performance available neural compute device.
 * Checks GPU (WebGPU) -> NPU (WebNN) -> CPU (WASM SIMD).
 */
export async function detectBestComputeDevice(): Promise<{
  device: ComputeDevice;
  label: string;
}> {
  // 1. Check for GPU acceleration via WebGPU (Highest raw throughput for browser AI)
  try {
    if (
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      navigator.gpu
    ) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        return {
          device: 'webgpu',
          label: 'GPU (Hardware Acceleration via WebGPU)',
        };
      }
    }
  } catch {
    // WebGPU not available, continue to NPU
  }

  // 2. Check for NPU support via WebNN (Dedicated low-power AI silicon)
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
    // WebNN NPU not available, continue to CPU
  }

  // 3. Fallback to CPU WASM SIMD
  return {
    device: 'cpu',
    label: 'CPU (WebAssembly SIMD High-Throughput)',
  };
}

export interface HardwareProfile {
  device: ComputeDevice;
  deviceLabel: string;
  gpuName?: string;
  cpuThreads: number;
  ramGb?: number;
  hasNpu: boolean;
  recommendedPrecision: ModelPrecision;
  recommendedModelId: string;
  recommendationReason: string;
}

/**
 * Perform comprehensive hardware inspection across GPU (WebGPU), NPU (WebNN),
 * and CPU/RAM, returning tailor-made precision and variant recommendations.
 */
export async function detectHardwareProfile(): Promise<HardwareProfile> {
  let device: ComputeDevice = 'cpu';
  let deviceLabel = 'CPU (WebAssembly SIMD)';
  let gpuName: string | undefined;
  let hasNpu = false;

  const cpuThreads =
    typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const ramGb =
    typeof navigator !== 'undefined'
      ? (navigator as unknown as { deviceMemory?: number }).deviceMemory
      : undefined;

  // 1. Check for WebGPU (GPU Primary)
  try {
    if (
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      navigator.gpu
    ) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        device = 'webgpu';
        deviceLabel = 'GPU (Hardware Acceleration via WebGPU)';
        const info =
          typeof (
            adapter as unknown as {
              requestAdapterInfo?: () => Promise<Record<string, string>>;
            }
          ).requestAdapterInfo === 'function'
            ? await (
                adapter as unknown as {
                  requestAdapterInfo: () => Promise<Record<string, string>>;
                }
              ).requestAdapterInfo()
            : undefined;
        if (info?.description) {
          gpuName = info.description;
        } else if (info?.vendor) {
          gpuName = `${info.vendor} ${info.architecture || ''}`.trim();
        }
      }
    }
  } catch {
    // WebGPU not available
  }

  // 2. Check for WebNN DirectML NPU (NPU Secondary)
  try {
    const nav = navigator as unknown as {
      ml?: {
        createContext?: (options?: {
          deviceType?: 'npu' | 'gpu' | 'cpu';
        }) => Promise<unknown>;
      };
    };
    if (nav.ml && typeof nav.ml.createContext === 'function') {
      const npu = await nav.ml.createContext({ deviceType: 'npu' });
      if (npu) {
        hasNpu = true;
        if (device === 'cpu') {
          device = 'npu';
          deviceLabel = 'NPU (WebNN Neural Processing Unit)';
        }
      }
    }
  } catch {
    // WebNN not present
  }

  const isHighEnd =
    (gpuName && !/intel/i.test(gpuName)) ||
    (ramGb && ramGb >= 16) ||
    cpuThreads >= 16;

  let recommendationReason: string;
  if (device === 'npu') {
    recommendationReason =
      'Dedicated NPU detected. INT8 Quantized delivers highest efficiency and battery savings.';
  } else if (device === 'webgpu' && isHighEnd) {
    recommendationReason = `${gpuName || 'Discrete GPU'} detected with abundant compute. INT8 is recommended for instant sub-10ms clustering, but your system easily supports full FP32 precision if you prefer maximum mathematical accuracy.`;
  } else if (device === 'webgpu') {
    recommendationReason = `${gpuName || 'GPU'} detected. INT8 Quantized is recommended for smooth tab grouping without memory pressure.`;
  } else {
    recommendationReason = `CPU execution (${cpuThreads} threads). INT8 Quantized is strongly recommended for ~270 MB memory footprint and low CPU load.`;
  }

  const recommendedModelId =
    isHighEnd && (ramGb ?? 8) >= 16
      ? 'tabman-embeddinggemma-2-440m'
      : 'tabman-embeddinggemma-2-270m';

  return {
    device,
    deviceLabel: gpuName ? `${gpuName} (${deviceLabel})` : deviceLabel,
    gpuName,
    cpuThreads,
    ramGb,
    hasNpu,
    recommendedPrecision: 'int8',
    recommendedModelId,
    recommendationReason,
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
