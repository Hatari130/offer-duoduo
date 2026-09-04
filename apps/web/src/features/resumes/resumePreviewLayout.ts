// CSS physical units use 96 px per inch. Scaling the preview must not reflow A4.
export const RESUME_A4_WIDTH_PX = 210 * 96 / 25.4;

export function calculateResumePreviewScale(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  // Round down so subpixel layout never pushes the paper past its container.
  return Math.min(1, Math.floor(availableWidth / RESUME_A4_WIDTH_PX * 1000) / 1000);
}
