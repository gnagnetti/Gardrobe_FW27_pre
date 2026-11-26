export type MarketArea = 'all' | 'russia_cis' | 'russia_bosco' | 'row';

export interface RefRow {
  gr: string;
  look: string;
  model: string;
  specifica: string;
  colorCode: string;
  styleNumber: string;
  rawStyleNumber?: string;
  rawColorCode?: string;
  key: string;
  order: number;
  photo: string;
  lookPhoto: string;
  isAccessory: boolean;
  styleTag: string;
}

export interface OrderRow {
  styleNumber: string;
  rawStyleNumber?: string;
  colorCode: string;
  altColorCode?: string;
  key: string;
  styleName: string;
  colorName: string;
  units: number;
  value: number;
  origValue: number;
  retailer: string;
  category: string;
  subcategory: string;
  country: string;
  image: string;
  styleTag: string;
}

export interface OrderStats {
  fileRows: number;
  parsedRows: number;
  fileUnits: number;
  fileValue: number;
}

export interface LookItem {
  ref: RefRow;
  units: number;
  value: number;
  matched: boolean;
}

export interface LookAnalysis {
  look: string;
  gr: string;
  lookPhoto: string;
  items: LookItem[];
  apparelTotal: number;
  apparelMatched: number;
  completeness: number;
  units: number;
  value: number;
  missing: LookItem[];
}

export interface GarderobeAnalysis {
  gr: string;
  looks: LookAnalysis[];
  completeLooks: number;
  completeness: number;
  units: number;
  value: number;
}

export interface UnmatchedStyleSummary {
  key: string;
  styleName: string;
  styleNumber: string;
  colorName: string;
  category: string;
  image: string;
  units: number;
  value: number;
  reason: string;
}

export type CustomMappingTarget =
  | {type: 'look'; look: string}
  | {type: 'commercial'};

export type CustomMappingMap = Record<string, CustomMappingTarget>;

export type LookPhotoMap = Record<string, string>;

export interface CollectionAnalysis {
  garderobes: GarderobeAnalysis[];
  looks: LookAnalysis[];
  overallCompleteness: number;
  completeLooks: number;
  totalLooks: number;
  units: number;
  value: number;
  retailers: number;
  matchedUnits: number;
  matchedValue: number;
  unmatchedItems: UnmatchedStyleSummary[];
}

export interface CategoryStat {
  name: string;
  units: number;
  value: number;
}

export interface SanityReport {
  fileRows: number;
  parsedRows: number;
  fileUnits: number;
  parsedUnits: number;
  fileValue: number;
  parsedValue: number;
  matchedUnits: number;
  unmatchedUnits: number;
  unmatchedItems: UnmatchedStyleSummary[];
  areaUnits: number;
  areaValue: number;
  areaSumMatchesTotal: boolean;
  ok: boolean;
}

export interface StyleStat {
  styleName: string;
  styleNumber: string;
  gr: string;
  image: string;
  units: number;
  value: number;
  share: number;
}

export interface StyleColorStat {
  styleName: string;
  styleNumber: string;
  colorName: string;
  label: string;
  gr: string;
  image: string;
  units: number;
  value: number;
  share: number;
}

export interface StyleTagItem {
  key: string;
  model: string;
  category: string;
  color: string;
  photo: string;
  tags: string[];
  units: number;
  value: number;
}

export interface ReportTableRow {
  id: string;
  image: string;
  variant?: 'separator' | 'total';
  cells: Array<string | number>;
}

export interface ReportTableData {
  title: string;
  columns: string[];
  rows: ReportTableRow[];
}
