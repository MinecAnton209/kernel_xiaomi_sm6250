export type RegionKind = 'chips' | 'items' | 'rows' | 'lines';

export interface RegionSpec {
  kind: RegionKind;
  /** chips: widths in px; lines: widths in percent of the row. */
  widths?: readonly number[];
  /** items and rows: how many placeholders to draw. */
  count?: number;
}

/**
 * Every place that fills in after the data arrives. The key is the id of the element that holds the
 * real content: it is hidden behind the placeholders until the data is there. The sizes mimic what
 * ends up in the region, so that nothing jumps when it is swapped.
 */
export const REGIONS = {
  status: { kind: 'chips', widths: [150, 140] },
  features: { kind: 'chips', widths: [92, 104, 80, 118, 96, 88, 110, 100] },
  pathList: { kind: 'items', count: 3 },
  batteryInfo: { kind: 'chips', widths: [118, 96, 104, 150] },
  sensorChips: { kind: 'chips', widths: [140, 120, 150, 130, 110, 124] },
  chargeInfo: { kind: 'chips', widths: [132, 96, 140, 170, 168, 160, 150, 190] },
  susSuStatus: { kind: 'chips', widths: [140, 132] },
  tuneList: { kind: 'rows', count: 7 },
  updateNotes: { kind: 'lines', widths: [92, 78, 60] },
} as const satisfies Record<string, RegionSpec>;

export type RegionId = keyof typeof REGIONS;

/** The regions a tab fills when it loads. The Tuning tab and the update notes manage their own. */
export const PAGE_REGIONS: Readonly<Record<string, readonly RegionId[]>> = {
  status: ['status', 'features', 'batteryInfo', 'sensorChips'],
  paths: ['pathList'],
  system: ['chargeInfo'],
  su: ['susSuStatus'],
};

export interface PlaceholderNode {
  className: string;
  width?: string;
}

export interface PlaceholderGroup {
  /** A wrapper for the nodes, when they share a layout of their own (a tuning row). */
  className?: string;
  nodes: PlaceholderNode[];
}

/** Class of the element that stands in for the real container, so that it lays its children out the same way. */
export function wrapperClass(kind: RegionKind): string {
  switch (kind) {
    case 'chips':
      return 'chips';
    case 'items':
      return 'list';
    case 'rows':
      return 'tune-list';
    case 'lines':
      return 'ph-lines';
  }
}

// Rows differ a little in width, so a column of them does not look like a stamp.
const ROW_TITLE_WIDTHS = [48, 56, 42];
const ROW_HINT_WIDTHS = [82, 70, 76];

export function placeholderGroups(spec: RegionSpec): PlaceholderGroup[] {
  const count = Math.max(0, spec.count ?? 0);
  switch (spec.kind) {
    case 'chips':
      return [{ nodes: (spec.widths ?? []).map((width) => ({ className: 'chip ph', width: `${width}px` })) }];
    case 'lines':
      return [{ nodes: (spec.widths ?? []).map((width) => ({ className: 'ph-line', width: `${width}%` })) }];
    case 'items':
      return [{ nodes: Array.from({ length: count }, () => ({ className: 'item ph-item' })) }];
    case 'rows':
      return Array.from({ length: count }, (_, index) => ({
        className: 'tune-row',
        nodes: [
          { className: 'ph-title', width: `${ROW_TITLE_WIDTHS[index % ROW_TITLE_WIDTHS.length]}%` },
          { className: 'ph-hint', width: `${ROW_HINT_WIDTHS[index % ROW_HINT_WIDTHS.length]}%` },
          { className: 'ph-field' },
        ],
      }));
  }
}
