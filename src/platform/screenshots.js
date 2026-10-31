// Component screenshots (F36): the panel crops each representative that is fully inside the
// viewport out of the visible-tab PNG, at most one per recipe variant per theme, default state.

/**
 * @param {Array<{mode: string, dataUrl: string, dpr: number, representatives: object[]}>} shots
 * @param {object[]} recipes ComponentRecipeV2
 * @param {string} snapshotId
 * @returns {Promise<object[]>} items for the screenshots store
 */
export async function cropScreenshots(shots, recipes, snapshotId) {
  const items = [];
  for (const shot of shots ?? []) {
    let bitmap;
    try {
      // Decoded by hand: the store build's CSP (connect-src 'none') blocks fetch() of data URLs.
      bitmap = await createImageBitmap(base64ToBlob(shot.dataUrl));
    } catch {
      continue;
    }
    const mode = shot.mode === 'dark' ? 'dark' : 'light';
    for (const recipe of recipes) {
      const rep = (shot.representatives ?? []).find(
        (r) => r.variant === recipe.sampleKey && r.inViewport,
      );
      if (!rep || rep.rect.width < 4 || rep.rect.height < 4) continue;
      const scale = shot.dpr || 1;
      const sx = Math.round(rep.rect.x * scale);
      const sy = Math.round(rep.rect.y * scale);
      const w = Math.min(Math.round(rep.rect.width * scale), bitmap.width - sx);
      const h = Math.min(Math.round(rep.rect.height * scale), bitmap.height - sy);
      if (w <= 0 || h <= 0) continue;
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d').drawImage(bitmap, sx, sy, w, h, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      items.push({
        snapshotId,
        id: `${recipe.id}:${mode}`,
        recipeId: recipe.id,
        mode,
        state: 'default',
        blob,
        width: w,
        height: h,
      });
    }
    bitmap.close?.();
  }
  return items;
}

export async function blobToBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

export async function blobToDataUrl(blob) {
  const bytes = await blobToBytes(blob);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

export function base64ToBlob(base64, type = 'image/png') {
  const binary = atob(base64.replace(/^data:[^,]+,/, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
