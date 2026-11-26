import type {
  CategoryStat,
  CollectionAnalysis,
  CustomMappingMap,
  GarderobeAnalysis,
  LookAnalysis,
  LookItem,
  LookPhotoMap,
  MarketArea,
  OrderRow,
  OrderStats,
  RefRow,
  SanityReport,
  StyleColorStat,
  StyleStat,
  StyleTagItem,
} from '../types/garderobe';
import {sanitizeImageUrl} from './parsers';

const RUSSIA_CIS_COUNTRIES = [
  'russia',
  'kazakhstan',
  'belarus',
  'uzbekistan',
  'azerbaijan',
  'armenia',
  'kyrgyzstan',
  'tajikistan',
  'moldova',
  'georgia',
  'estonia',
  'latvia',
  'ukraine',
  'italy',
  'italia',
];

export function isRussiaCis(country: string): boolean {
  const lower = country.trim().toLowerCase();
  return RUSSIA_CIS_COUNTRIES.some((c) => lower === c || lower.includes(c));
}

export function isRussiaBosco(country: string): boolean {
  const lower = country.trim().toLowerCase();
  return lower === 'russia' || lower === 'italy' || lower === 'italia';
}

export function filterOrders(
  orders: OrderRow[],
  area: MarketArea,
  country: string | null,
): OrderRow[] {
  return orders.filter((row) => {
    if (country === 'Russia + Bosco') return isRussiaBosco(row.country);
    if (country && row.country !== country) return false;
    if (area === 'russia_cis') return isRussiaCis(row.country);
    if (area === 'russia_bosco') return isRussiaBosco(row.country);
    if (area === 'row') return !isRussiaCis(row.country);
    return true;
  });
}

const normText = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ');
const normAlpha = (v: string) => v.trim().toUpperCase().replace(/^0+/, '');

function getModelStems(name: string): string[] {
  const clean = normText(name);
  if (!clean) return [];
  const stems = new Set<string>();
  stems.add(clean);
  const noVariant = clean.replace(/\s+[a-z0-9]{1,2}$/, '').trim();
  if (noVariant.length >= 3) stems.add(noVariant);
  const noX = noVariant.replace(/^x(?=[a-z]{3,})/, '');
  if (noX.length >= 3) stems.add(noX);
  const firstWord = noVariant.split(/[\s\-_/]+/)[0] ?? '';
  if (firstWord.length >= 4) stems.add(firstWord);
  const firstWordNoX = firstWord.replace(/^x(?=[a-z]{3,})/, '');
  if (firstWordNoX.length >= 4) stems.add(firstWordNoX);
  return [...stems];
}

export function getUnmatchedStyleKey(order: OrderRow): string {
  return (
    order.rawStyleNumber ||
    order.styleNumber ||
    normText(order.styleName) ||
    'unknown'
  );
}

function findMatchingRefIndices(
  order: OrderRow,
  refIndex: {
    byKey: Map<string, number[]>;
    byAlphaKey: Map<string, number[]>;
    byTextColor: Map<string, number[]>;
    byModelColor: Map<string, number[]>;
    byStyle: Map<string, number[]>;
    byAlphaStyle: Map<string, number[]>;
    byModelName: Map<string, number[]>;
    byBaseName: Map<string, number[]>;
  },
): number[] {
  // Tier 1: Exact numeric StyleNumber|ColorDigits (checking both Color Code & Color Name digits)
  if (order.key && order.key !== '|') {
    const m = refIndex.byKey.get(order.key);
    if (m?.length) return m;
  }
  if (order.styleNumber && order.altColorCode) {
    const m = refIndex.byKey.get(`${order.styleNumber}|${order.altColorCode}`);
    if (m?.length) return m;
  }

  // Tier 2: Alphanumeric Style|Color or Style|ColorName text
  const alphaStyle = order.rawStyleNumber || normAlpha(order.styleNumber);
  const alphaColor = normAlpha(order.colorName);
  if (alphaStyle && alphaColor) {
    const m = refIndex.byAlphaKey.get(`${alphaStyle}|${alphaColor}`);
    if (m?.length) return m;
  }
  const colorText = normText(order.colorName);
  if (order.styleNumber && colorText) {
    const m = refIndex.byTextColor.get(`${order.styleNumber}|${colorText}`);
    if (m?.length) return m;
  }

  // Tier 3: Model Name + Color
  const modelText = normText(order.styleName);
  if (modelText && colorText) {
    const m = refIndex.byModelColor.get(`${modelText}|${colorText}`);
    if (m?.length) return m;
  }

  // Tier 4: Style Number / exact Model Name fallback (different colorway of an indexed style)
  if (order.styleNumber) {
    const m = refIndex.byStyle.get(order.styleNumber);
    if (m?.length) return m;
  }
  if (alphaStyle) {
    const m = refIndex.byAlphaStyle.get(alphaStyle);
    if (m?.length) return m;
  }
  if (modelText) {
    const m = refIndex.byModelName.get(modelText);
    if (m?.length) return m;
  }

  // Tier 5: Base Model Name / Variant Letter stripping (e.g. "Minuccio      C" -> "Minuccio", "Xginevra A" -> "Ginevra")
  if (modelText) {
    for (const stem of getModelStems(order.styleName)) {
      const m = refIndex.byBaseName.get(stem);
      if (m?.length) return m;
    }
  }

  return [];
}

export function analyzeCollection(
  refRows: RefRow[],
  orders: OrderRow[],
  customMappings: CustomMappingMap = {},
  lookPhotoOverrides: LookPhotoMap = {},
  lookPhotoFallbacks: LookPhotoMap = {},
): CollectionAnalysis {
  const byKey = new Map<string, number[]>();
  const byAlphaKey = new Map<string, number[]>();
  const byTextColor = new Map<string, number[]>();
  const byModelColor = new Map<string, number[]>();
  const byStyle = new Map<string, number[]>();
  const byAlphaStyle = new Map<string, number[]>();
  const byModelName = new Map<string, number[]>();
  const byBaseName = new Map<string, number[]>();
  const firstIdxByLook = new Map<string, number>();

  const pushTo = (map: Map<string, number[]>, key: string, idx: number) => {
    if (!key) return;
    const arr = map.get(key) ?? [];
    arr.push(idx);
    map.set(key, arr);
  };

  refRows.forEach((ref, idx) => {
    if (ref.look && !firstIdxByLook.has(ref.look)) {
      firstIdxByLook.set(ref.look, idx);
    }
    if (ref.key && ref.key !== '|') pushTo(byKey, ref.key, idx);
    const alphaStyle = ref.rawStyleNumber || normAlpha(ref.styleNumber);
    const alphaColor = ref.rawColorCode || normAlpha(ref.colorCode);
    if (alphaStyle && alphaColor) {
      pushTo(byAlphaKey, `${alphaStyle}|${alphaColor}`, idx);
    }
    const colorText = normText(ref.colorCode);
    if (ref.styleNumber && colorText) {
      pushTo(byTextColor, `${ref.styleNumber}|${colorText}`, idx);
    }
    const modelText = normText(ref.model);
    if (modelText && colorText) {
      pushTo(byModelColor, `${modelText}|${colorText}`, idx);
    }
    if (ref.styleNumber) pushTo(byStyle, ref.styleNumber, idx);
    if (alphaStyle) pushTo(byAlphaStyle, alphaStyle, idx);
    if (modelText) pushTo(byModelName, modelText, idx);
    for (const stem of getModelStems(ref.model)) {
      pushTo(byBaseName, stem, idx);
    }
  });

  const refIndex = {
    byKey,
    byAlphaKey,
    byTextColor,
    byModelColor,
    byStyle,
    byAlphaStyle,
    byModelName,
    byBaseName,
  };

  // Track primary unit/value attribution per RefRow index (avoiding double-counting)
  // while marking all matching RefRows as matched for look completeness & image enrichment.
  const unitsByRefIdx = new Map<number, number>();
  const valueByRefIdx = new Map<number, number>();
  const imageByRefIdx = new Map<number, string>();
  const matchedFlagByRefIdx = new Set<number>();

  let matchedUnits = 0;
  let matchedValue = 0;
  const unmatchedMap = new Map<
    string,
    CollectionAnalysis['unmatchedItems'][number]
  >();

  for (const order of orders) {
    let matchedIndices = findMatchingRefIndices(order, refIndex);
    let reconciledCommercial = false;

    if (matchedIndices.length === 0) {
      const mapping = customMappings[getUnmatchedStyleKey(order)];
      if (mapping?.type === 'look') {
        const targetIdx = firstIdxByLook.get(mapping.look);
        if (targetIdx !== undefined) {
          matchedIndices = [targetIdx];
        }
      } else if (mapping?.type === 'commercial') {
        reconciledCommercial = true;
      }
    }

    if (matchedIndices.length > 0) {
      matchedUnits += order.units;
      matchedValue += order.value;
      const primaryIdx = matchedIndices[0];
      unitsByRefIdx.set(
        primaryIdx,
        (unitsByRefIdx.get(primaryIdx) ?? 0) + order.units,
      );
      valueByRefIdx.set(
        primaryIdx,
        (valueByRefIdx.get(primaryIdx) ?? 0) + order.value,
      );
      for (const idx of matchedIndices) {
        if (order.units > 0) matchedFlagByRefIdx.add(idx);
        if (order.image && !imageByRefIdx.has(idx)) {
          imageByRefIdx.set(idx, order.image);
        }
      }
    } else if (reconciledCommercial) {
      matchedUnits += order.units;
      matchedValue += order.value;
    } else {
      const styleLabel = order.styleName || order.styleNumber || '—';
      const styleKey = getUnmatchedStyleKey(order);
      const uKey = `${styleLabel}||${order.styleNumber}||${order.colorName}`;
      const existing = unmatchedMap.get(uKey) ?? {
        key: styleKey,
        styleName: styleLabel,
        styleNumber: order.rawStyleNumber || order.styleNumber || '—',
        colorName: order.colorName || order.colorCode || '—',
        category: order.category,
        image: order.image,
        units: 0,
        value: 0,
        reason: order.styleNumber
          ? `Style #${order.rawStyleNumber || order.styleNumber} not in reference CSV`
          : 'Missing Style Number',
      };
      existing.units += order.units;
      existing.value += order.value;
      if (!existing.image && order.image) existing.image = order.image;
      unmatchedMap.set(uKey, existing);
    }
  }

  const byLook = new Map<string, Array<{ref: RefRow; idx: number}>>();
  refRows.forEach((ref, idx) => {
    if (!ref.look) return;
    const arr = byLook.get(ref.look) ?? [];
    arr.push({ref, idx});
    byLook.set(ref.look, arr);
  });

  const looks: LookAnalysis[] = [];
  for (const [lookId, group] of byLook) {
    const sorted = [...group].sort((a, b) => a.ref.order - b.ref.order);
    const items: LookItem[] = sorted.map(({ref, idx}) => {
      const resolvedPhoto = ref.photo || imageByRefIdx.get(idx) || '';
      const units = unitsByRefIdx.get(idx) ?? 0;
      const value = valueByRefIdx.get(idx) ?? 0;
      return {
        ref: resolvedPhoto === ref.photo ? ref : {...ref, photo: resolvedPhoto},
        units,
        value,
        matched: matchedFlagByRefIdx.has(idx),
      };
    });

    const apparel = items.filter((item) => !item.ref.isAccessory);
    const apparelMatched = apparel.filter((item) => item.matched).length;
    const completeness = apparel.length
      ? (apparelMatched / apparel.length) * 100
      : 0;

    const normalizedLookId = lookId.trim().replace(/^0+/, '');
    const userOverride = sanitizeImageUrl(
      lookPhotoOverrides[lookId] ?? lookPhotoOverrides[normalizedLookId] ?? '',
    );
    const csvLookPhoto = sanitizeImageUrl(
      sorted.find(({ref}) => ref.lookPhoto)?.ref.lookPhoto ?? '',
    );
    const fallbackLookPhoto = sanitizeImageUrl(
      lookPhotoFallbacks[lookId] ?? lookPhotoFallbacks[normalizedLookId] ?? '',
    );

    looks.push({
      look: lookId,
      gr: sorted[0]?.ref.gr ?? '—',
      lookPhoto:
        userOverride ||
        csvLookPhoto ||
        fallbackLookPhoto ||
        items.find((i) => i.matched && i.ref.photo)?.ref.photo ||
        items.find((i) => i.ref.photo)?.ref.photo ||
        '',
      items,
      apparelTotal: apparel.length,
      apparelMatched,
      completeness,
      units: items.reduce((sum, item) => sum + item.units, 0),
      value: items.reduce((sum, item) => sum + item.value, 0),
      missing: items.filter((item) => !item.matched),
    });
  }

  looks.sort((a, b) => Number(a.look) - Number(b.look));

  const byGr = new Map<string, LookAnalysis[]>();
  for (const look of looks) {
    const arr = byGr.get(look.gr) ?? [];
    arr.push(look);
    byGr.set(look.gr, arr);
  }

  const garderobes: GarderobeAnalysis[] = [...byGr.entries()]
    .map(([gr, grLooks]) => ({
      gr,
      looks: grLooks,
      completeLooks: grLooks.filter((l) => l.completeness >= 100).length,
      completeness:
        grLooks.reduce((sum, l) => sum + l.completeness, 0) /
        (grLooks.length || 1),
      units: grLooks.reduce((sum, l) => sum + l.units, 0),
      value: grLooks.reduce((sum, l) => sum + l.value, 0),
    }))
    .sort((a, b) => b.units - a.units);

  const unmatchedItems = [...unmatchedMap.values()].sort(
    (a, b) => b.units - a.units,
  );

  return {
    garderobes,
    looks,
    overallCompleteness:
      looks.reduce((sum, l) => sum + l.completeness, 0) / (looks.length || 1),
    completeLooks: looks.filter((l) => l.completeness >= 100).length,
    totalLooks: looks.length,
    units: orders.reduce((sum, o) => sum + o.units, 0),
    value: orders.reduce((sum, o) => sum + o.value, 0),
    retailers: new Set(orders.map((o) => o.retailer)).size,
    matchedUnits,
    matchedValue,
    unmatchedItems,
  };
}

export function getCategoryStats(orders: OrderRow[]): CategoryStat[] {
  const map = new Map<string, {units: number; value: number}>();
  for (const row of orders) {
    const name = `${row.category} · ${row.subcategory}`;
    const entry = map.get(name) ?? {units: 0, value: 0};
    entry.units += row.units;
    entry.value += row.value;
    map.set(name, entry);
  }
  return [...map.entries()]
    .map(([name, val]) => ({name, ...val}))
    .sort((a, b) => b.units - a.units);
}

export function getUniqueCountries(orders: OrderRow[]): string[] {
  return [...new Set(orders.map((o) => o.country))].sort();
}

export function buildSanityReport(
  orders: OrderRow[],
  stats: OrderStats,
  analysis: CollectionAnalysis,
): SanityReport {
  const parsedUnits = orders.reduce((s, o) => s + o.units, 0);
  const parsedValue = orders.reduce((s, o) => s + o.value, 0);
  const cis = orders.filter((o) => isRussiaCis(o.country));
  const row = orders.filter((o) => !isRussiaCis(o.country));
  const areaUnits = cis.reduce((s, o) => s + o.units, 0);
  const rowUnits = row.reduce((s, o) => s + o.units, 0);
  const areaValue = cis.reduce((s, o) => s + o.value, 0);
  const rowValue = row.reduce((s, o) => s + o.value, 0);

  const areaSumMatchesTotal =
    Math.abs(areaUnits + rowUnits - parsedUnits) < 0.001 &&
    Math.abs(areaValue + rowValue - parsedValue) < 0.01;

  return {
    fileRows: stats.fileRows,
    parsedRows: stats.parsedRows,
    fileUnits: stats.fileUnits,
    parsedUnits,
    fileValue: stats.fileValue,
    parsedValue,
    matchedUnits: analysis.matchedUnits,
    unmatchedUnits: parsedUnits - analysis.matchedUnits,
    unmatchedItems: analysis.unmatchedItems,
    areaUnits,
    areaValue,
    areaSumMatchesTotal,
    ok:
      stats.fileRows === stats.parsedRows &&
      Math.abs(stats.fileUnits - parsedUnits) < 0.001 &&
      areaSumMatchesTotal,
  };
}

export function computeValueShare(
  filtered: OrderRow[],
  total: OrderRow[],
): number {
  const totalVal = total.reduce((s, o) => s + o.value, 0);
  const filteredVal = filtered.reduce((s, o) => s + o.value, 0);
  if (totalVal <= 0) return 0;
  const pct = (filteredVal / totalVal) * 100;
  if (pct > 100.01 || pct < -0.01) {
    console.warn(
      `[garderobe] Anomalous value share: filtered ${filteredVal} vs total ${totalVal} (${pct.toFixed(2)}%) — clamped.`,
    );
  }
  return Math.min(100, Math.max(0, pct));
}

export function checkShareIntegrity(orders: OrderRow[]) {
  const cis = orders.filter((o) => isRussiaCis(o.country));
  const row = orders.filter((o) => !isRussiaCis(o.country));
  const areaSum =
    computeValueShare(cis, orders) + computeValueShare(row, orders);
  const countrySum = getUniqueCountries(orders).reduce(
    (sum, country) =>
      sum +
      computeValueShare(
        orders.filter((o) => o.country === country),
        orders,
      ),
    0,
  );
  const ok = Math.abs(areaSum - 100) < 0.01 && Math.abs(countrySum - 100) < 0.01;
  if (!ok && orders.length) {
    console.warn(
      `[garderobe] Share integrity check failed — areas ${areaSum.toFixed(3)}%, countries ${countrySum.toFixed(3)}%.`,
    );
  }
  return {areaSum, countrySum, ok};
}

const EXCLUDED_ACCESSORY_TERMS = [
  'accessor',
  'bag',
  'bags',
  'borsa',
  'borse',
  'leather good',
];

const hasAccessoryTerm = (value: string): boolean => {
  const lower = value.trim().toLowerCase();
  return lower ? EXCLUDED_ACCESSORY_TERMS.some((t) => lower.includes(t)) : false;
};

export function isOrderAccessory(row: OrderRow, specifica = ''): boolean {
  return (
    hasAccessoryTerm(row.category) ||
    hasAccessoryTerm(row.subcategory) ||
    hasAccessoryTerm(specifica)
  );
}

export function excludeAccessories(
  orders: OrderRow[],
  refRows: RefRow[] = [],
): OrderRow[] {
  const specByKey = new Map<string, string>();
  const specByStyle = new Map<string, string>();
  for (const ref of refRows) {
    if (ref.key && !specByKey.has(ref.key)) specByKey.set(ref.key, ref.specifica);
    if (ref.styleNumber && !specByStyle.has(ref.styleNumber)) {
      specByStyle.set(ref.styleNumber, ref.specifica);
    }
  }
  return orders.filter(
    (row) =>
      !isOrderAccessory(
        row,
        specByKey.get(row.key) ?? specByStyle.get(row.styleNumber) ?? '',
      ),
  );
}

export function splitTags(raw: unknown): string[] {
  return [
    ...new Set(
      String(raw ?? '')
        .split(/[,;|/]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
}

export function extractUniqueStyleTags(
  orders: OrderRow[],
  refRows: RefRow[],
): string[] {
  const set = new Set<string>();
  for (const o of orders) {
    for (const t of splitTags(o.styleTag)) set.add(t);
  }
  for (const r of refRows) {
    for (const t of splitTags(r.styleTag)) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function rankStylesByTags(
  orders: OrderRow[],
  refRows: RefRow[],
  selectedTags: string[],
): StyleTagItem[] {
  const selected = new Set(selectedTags);
  const refByKey = new Map<string, RefRow>();
  const refByStyle = new Map<string, RefRow>();

  for (const r of refRows) {
    if (r.key && !refByKey.has(r.key)) refByKey.set(r.key, r);
    if (r.styleNumber && !refByStyle.has(r.styleNumber)) {
      refByStyle.set(r.styleNumber, r);
    }
  }

  const map = new Map<string, StyleTagItem>();
  for (const o of orders) {
    const ref = refByKey.get(o.key) ?? refByStyle.get(o.styleNumber);
    const tags = [...splitTags(o.styleTag), ...splitTags(ref?.styleTag ?? '')];
    if (!tags.some((t) => selected.has(t))) continue;

    const itemKey = o.key || `${o.styleName}|${o.colorName}`;
    const entry = map.get(itemKey) ?? {
      key: itemKey,
      model: ref?.model || o.styleName || o.styleNumber || '—',
      category: o.category || ref?.specifica || '—',
      color: o.colorName || ref?.colorCode || o.colorCode || '—',
      photo: o.image || ref?.photo || '',
      tags: [],
      units: 0,
      value: 0,
    };
    entry.units += o.units;
    entry.value += o.origValue;
    if (!entry.photo) entry.photo = o.image || ref?.photo || '';
    for (const tag of tags) {
      if (!entry.tags.includes(tag)) entry.tags.push(tag);
    }
    map.set(itemKey, entry);
  }

  return [...map.values()].sort((a, b) => b.units - a.units);
}

export function aggregateStyles(
  orders: OrderRow[],
  refRows: RefRow[],
): StyleStat[] {
  const grByStyle = new Map<string, string>();
  const photoByStyle = new Map<string, string>();
  for (const ref of refRows) {
    if (ref.styleNumber && !grByStyle.has(ref.styleNumber)) {
      grByStyle.set(ref.styleNumber, ref.gr);
    }
    if (ref.styleNumber && ref.photo && !photoByStyle.has(ref.styleNumber)) {
      photoByStyle.set(ref.styleNumber, ref.photo);
    }
  }

  const map = new Map<string, StyleStat>();
  for (const o of orders) {
    const name = o.styleName || o.styleNumber || '—';
    const entry = map.get(name) ?? {
      styleName: name,
      styleNumber: o.styleNumber,
      gr: grByStyle.get(o.styleNumber) ?? '—',
      image: '',
      units: 0,
      value: 0,
      share: 0,
    };
    entry.units += o.units;
    entry.value += o.origValue;
    if (!entry.image && o.image) entry.image = o.image;
    if (!entry.image) entry.image = photoByStyle.get(o.styleNumber) ?? '';
    if (entry.gr === '—') entry.gr = grByStyle.get(o.styleNumber) ?? '—';
    map.set(name, entry);
  }

  const list = [...map.values()];
  const totalValue = list.reduce((s, item) => s + item.value, 0);
  for (const item of list) {
    item.share = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
  }
  return list;
}

export function verifyStyleAggregation(
  orders: OrderRow[],
  styles: StyleStat[],
) {
  const units = orders.reduce((s, o) => s + o.units, 0);
  const value = orders.reduce((s, o) => s + o.origValue, 0);
  const aggregatedUnits = styles.reduce((s, st) => s + st.units, 0);
  const aggregatedValue = styles.reduce((s, st) => s + st.value, 0);
  const ok =
    Math.abs(units - aggregatedUnits) < 0.001 &&
    Math.abs(value - aggregatedValue) < 0.01;
  if (!ok) {
    console.warn(
      `[garderobe] Style aggregation mismatch — units ${aggregatedUnits}/${units}, value ${aggregatedValue}/${value}.`,
    );
  }
  return {ok, units, value, aggregatedUnits, aggregatedValue};
}

export function aggregateStyleColors(
  orders: OrderRow[],
  refRows: RefRow[],
): StyleColorStat[] {
  const grByStyle = new Map<string, string>();
  const grByKey = new Map<string, string>();
  const photoByKey = new Map<string, string>();
  const photoByStyle = new Map<string, string>();
  for (const ref of refRows) {
    if (ref.styleNumber && !grByStyle.has(ref.styleNumber)) {
      grByStyle.set(ref.styleNumber, ref.gr);
    }
    if (ref.key && !grByKey.has(ref.key)) {
      grByKey.set(ref.key, ref.gr);
    }
    if (ref.key && ref.photo && !photoByKey.has(ref.key)) {
      photoByKey.set(ref.key, ref.photo);
    }
    if (ref.styleNumber && ref.photo && !photoByStyle.has(ref.styleNumber)) {
      photoByStyle.set(ref.styleNumber, ref.photo);
    }
  }

  const map = new Map<string, StyleColorStat>();
  for (const o of orders) {
    const styleName = o.styleName || o.styleNumber || '—';
    const colorName = o.colorName || o.colorCode || '—';
    const composite = `${styleName}||${colorName}`;
    const gr = grByKey.get(o.key) ?? grByStyle.get(o.styleNumber) ?? '—';

    const entry = map.get(composite) ?? {
      styleName,
      styleNumber: o.styleNumber,
      colorName,
      label: `${styleName} · ${colorName}`,
      gr,
      image: '',
      units: 0,
      value: 0,
      share: 0,
    };
    entry.units += o.units;
    entry.value += o.origValue;
    if (!entry.image && o.image) entry.image = o.image;
    if (!entry.image) {
      entry.image =
        photoByKey.get(o.key) ?? photoByStyle.get(o.styleNumber) ?? '';
    }
    if (entry.gr === '—' && gr !== '—') entry.gr = gr;
    map.set(composite, entry);
  }

  const list = [...map.values()];
  const totalValue = list.reduce((s, item) => s + item.value, 0);
  for (const item of list) {
    item.share = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
  }
  return list.sort((a, b) => b.units - a.units);
}

export function verifyStyleColorAggregation(
  orders: OrderRow[],
  styleColors: StyleColorStat[],
) {
  const units = orders.reduce((s, o) => s + o.units, 0);
  const value = orders.reduce((s, o) => s + o.origValue, 0);
  const aggregatedUnits = styleColors.reduce((s, st) => s + st.units, 0);
  const aggregatedValue = styleColors.reduce((s, st) => s + st.value, 0);
  const shareSum = styleColors.reduce((s, st) => s + st.share, 0);
  const ok =
    Math.abs(units - aggregatedUnits) < 0.001 &&
    Math.abs(value - aggregatedValue) < 0.01 &&
    (styleColors.length === 0 || Math.abs(shareSum - 100) < 0.05);
  if (!ok) {
    console.warn(
      `[garderobe] Style/Color aggregation mismatch — units ${aggregatedUnits}/${units}, value ${aggregatedValue}/${value}, share ${shareSum.toFixed(2)}%.`,
    );
  }
  return {ok, units, value, aggregatedUnits, aggregatedValue, shareSum};
}
