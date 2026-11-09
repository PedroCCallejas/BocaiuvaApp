export type ShareResult = 'shared' | 'canceled' | 'unsupported' | 'failed';
export type FileShareNavigator = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

// Called directly from a user gesture, with a File already prepared.
export async function sharePreparedImage(file: File, title: string, nav: FileShareNavigator): Promise<ShareResult> {
  try {
    if (!nav.share || !nav.canShare?.({ files: [file] })) return 'unsupported';
    await nav.share({ files: [file], title });
    return 'shared';
  } catch (error) {
    return (error as { name?: string })?.name === 'AbortError' ? 'canceled' : 'failed';
  }
}

export function downloadPreparedImage(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = file.name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function pngDataUrlToFile(dataUrl: string, filename: string) {
  const binary = atob(dataUrl.split(',')[1]);
  return new File([Uint8Array.from(binary, (character) => character.charCodeAt(0))], filename, { type: 'image/png' });
}

