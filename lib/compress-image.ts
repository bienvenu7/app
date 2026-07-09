const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;
const SKIP_BELOW_BYTES = 150 * 1024;

/** Target total payload for a single multipart request. */
export const MAX_SINGLE_REQUEST_BYTES = 900 * 1024;

type CompressOptions = {
  maxDimension?: number;
  quality?: number;
};

export async function compressImageFile(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const maxDimension = options.maxDimension ?? MAX_DIMENSION;
  const quality = options.quality ?? JPEG_QUALITY;

  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDimension / longestSide);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const compressed = new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    if (file.size > SKIP_BELOW_BYTES && compressed.size >= file.size) {
      return file;
    }

    return compressed;
  } catch {
    return file;
  }
}

function totalSize(files: File[]) {
  return files.reduce((sum, file) => sum + file.size, 0);
}

const COMPRESSION_LEVELS: CompressOptions[] = [
  { maxDimension: 1600, quality: 0.75 },
  { maxDimension: 1200, quality: 0.65 },
  { maxDimension: 1000, quality: 0.55 },
  { maxDimension: 800, quality: 0.45 },
];

/** Compress all images so they can be sent in one request. */
export async function compressImageFilesForUpload(
  files: File[],
): Promise<File[]> {
  for (const level of COMPRESSION_LEVELS) {
    const compressed = await Promise.all(
      files.map((file) => compressImageFile(file, level)),
    );

    if (totalSize(compressed) <= MAX_SINGLE_REQUEST_BYTES) {
      return compressed;
    }
  }

  const budgetPerFile = Math.floor(MAX_SINGLE_REQUEST_BYTES / files.length);
  return Promise.all(
    files.map((file) => compressImageFile(file, { maxDimension: 720, quality: 0.4 }))
      .then(async (compressed) => {
        if (compressed.size <= budgetPerFile) return compressed;
        return compressImageFile(file, { maxDimension: 640, quality: 0.35 });
      }),
  );
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
