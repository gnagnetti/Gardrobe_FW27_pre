import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {OrderRow, OrderStats, RefRow} from '../types/garderobe';
import {DEFAULT_LOOK_PHOTOS} from './defaultLookPhotos';

export const STORAGE_KEY = 'garderobe.reference.v1';

const ACCESSORY_KEYWORDS = [
  'borsa',
  'borse',
  'cintura',
  'calzature',
  'scarpa',
  'scarpe',
  'orecchino',
  'bracciale',
  'collana',
  'anello',
  'foulard',
  'sciarpa',
  'cappello',
  'occhiali',
  'guanti',
  'gioiell',
  'accessor',
  'spilla',
  'portafoglio',
];

export const cleanStr = (v: unknown): string => String(v ?? '').trim();

export const normalizeDigits = (v: string): string =>
  v.replace(/\D/g, '').replace(/^0+/, '');

export const normalizeAlphaNum = (v: string): string =>
  v.trim().toUpperCase().replace(/^0+/, '');

export const normalizeToken = (v: string): string =>
  v.trim().toLowerCase().replace(/\s+/g, ' ');

export function sanitizeImageUrl(v: unknown): string {
  let s = cleanStr(v).replace(/^["']+|["']+$/g, '');
  if (!s || s.startsWith('#')) return '';
  if (s.startsWith('//')) s = `https:${s}`;
  if (/^227pre\.netlify\.app\//i.test(s)) {
    s = `https://${s}`;
  }
  if (/^https?:\/\/227pre\.netlify\.app\/227pre\//i.test(s)) {
    s = s.replace(
      /^(https?:\/\/227pre\.netlify\.app)\/227pre\//i,
      '$1/',
    );
  }
  if (
    /^https?:\/\//i.test(s) ||
    s.startsWith('/src/assets/') ||
    s.startsWith('data:image/') ||
    s.startsWith('blob:')
  ) {
    return s;
  }
  return '';
}

export const formatEuro = (v: number): string =>
  `€ ${Math.round(v).toLocaleString('it-IT')}`;

export function normalizeLookId(v: unknown): string {
  const s = cleanStr(v).replace(/^look\s*/i, '').trim();
  if (!s) return '';
  return s.replace(/^0+(?=\d)/, '');
}

export function normalizeRefRows(rows: RefRow[]): RefRow[] {
  return rows.map((row) => {
    const look = normalizeLookId(row.look) || cleanStr(row.look);
    const lookPhoto =
      sanitizeImageUrl(row.lookPhoto) ||
      (look ? DEFAULT_LOOK_PHOTOS[look] ?? '' : '');
    return {
      ...row,
      look,
      photo: sanitizeImageUrl(row.photo),
      lookPhoto,
    };
  });
}

function detectCsvDelimiter(csvText: string): string {
  const firstLine = csvText.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (semicolons >= commas && semicolons >= tabs && semicolons > 0) return ';';
  if (tabs > commas && tabs > 0) return '\t';
  if (commas > 0) return ',';
  return ';';
}

export function parseReferenceCsv(csvText: string): RefRow[] {
  const cleanedCsv = csvText.replace(/^\uFEFF/, '');
  const delimiter = detectCsvDelimiter(cleanedCsv);
  const parsed = Papa.parse<Record<string, unknown>>(cleanedCsv, {
    delimiter,
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
  });

  const rows: RefRow[] = [];
  let lastGr = '';
  const photoByModel = new Map<string, string>();
  const lookPhotoByLook = new Map<string, string>();

  const pickField = (
    row: Record<string, unknown>,
    candidates: string[],
  ): string => {
    for (const key of candidates) {
      if (row[key] !== undefined && row[key] !== null) {
        const val = cleanStr(row[key]);
        if (val) return val;
      }
    }
    const lowerMap = new Map(
      Object.entries(row).map(([k, v]) => [k.replace(/^\uFEFF/, '').trim().toLowerCase(), v]),
    );
    for (const key of candidates) {
      const val = cleanStr(lowerMap.get(key.toLowerCase()));
      if (val) return val;
    }
    return '';
  };

  for (const row of parsed.data) {
    const model = pickField(row, ['nome_modello', 'Model', 'Style Name', 'nome modello']);
    const look = normalizeLookId(
      pickField(row, ['nr_modello', 'Look', 'nr modello', 'n_modello', 'look_number']),
    );
    const rawIdJoor = pickField(row, ['ID Joor', 'id_joor', 'IDJoor', 'Style Number']);
    const rawLookPhoto = sanitizeImageUrl(
      pickField(row, [
        'fotolook',
        'FotoLook',
        'Foto Look',
        'foto look',
        'foto_look',
        'lookPhoto',
        'Look Photo',
        'look_photo',
      ]),
    );

    if (look && rawLookPhoto && !lookPhotoByLook.has(look)) {
      lookPhotoByLook.set(look, rawLookPhoto);
    }

    if (!model && !rawIdJoor) continue;

    const gr = pickField(row, ['GR', 'Garderobe', 'gr']) || lastGr;
    lastGr = gr;

    const [rawStyle = '', splitRawColor = ''] = rawIdJoor.split(/\|+|;\|+/);
    const rawFoto = pickField(row, ['Foto', 'Photo', 'Image', 'foto']);
    const rawColor =
      splitRawColor || (rawFoto.startsWith('|') ? rawFoto.replace(/^\|+/, '') : '');
    const styleNumber = normalizeDigits(rawStyle);
    const rawStyleNumber = normalizeAlphaNum(rawStyle);
    const colorDisplay = pickField(row, ['colore', 'Color', 'Colore']);
    const colorDigits =
      normalizeDigits(rawColor) || normalizeDigits(colorDisplay);
    const rawColorCode =
      normalizeAlphaNum(rawColor) || normalizeAlphaNum(colorDisplay);
    const specifica = pickField(row, ['specifica', 'Category', 'Specifica']);
    const photo = sanitizeImageUrl(rawFoto);

    if (photo && !photoByModel.has(model)) {
      photoByModel.set(model, photo);
    }

    const styleTag = pickField(row, [
      'Style Tags',
      'StyleTags',
      'StyleTag',
      'Style Tag',
      'styletag',
      'Tags',
      'Tag',
      'tag',
    ]);

    const resolvedLookPhoto =
      rawLookPhoto || (look ? DEFAULT_LOOK_PHOTOS[look] ?? '' : '');

    rows.push({
      gr,
      look,
      model,
      specifica,
      colorCode: colorDisplay,
      styleNumber,
      rawStyleNumber,
      rawColorCode,
      key: `${styleNumber}|${colorDigits}`,
      order: Number(pickField(row, ['ordinamento', 'Order', 'Ordinamento'])) || 99,
      photo,
      lookPhoto: resolvedLookPhoto,
      isAccessory: ACCESSORY_KEYWORDS.some((kw) =>
        specifica.toLowerCase().includes(kw),
      ),
      styleTag,
    });
  }

  for (const row of rows) {
    if (!row.photo) {
      row.photo = photoByModel.get(row.model) ?? '';
    }
    if (!row.lookPhoto && row.look) {
      row.lookPhoto =
        lookPhotoByLook.get(row.look) ?? DEFAULT_LOOK_PHOTOS[row.look] ?? '';
    }
  }

  return rows;
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const name of candidates) {
    const idx = lowered.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function extractUrlFromCell(
  sheet: XLSX.WorkSheet,
  rowIdx: number,
  colIdx: number,
  rawCellVal: unknown,
): string {
  const direct = sanitizeImageUrl(rawCellVal);
  if (direct) return direct;

  if (colIdx < 0) return '';
  const addr = XLSX.utils.encode_cell({r: rowIdx, c: colIdx});
  const cell = sheet[addr] as XLSX.CellObject | undefined;
  if (!cell) return '';

  if (cell.l?.Target) {
    const fromLink = sanitizeImageUrl(cell.l.Target);
    if (fromLink) return fromLink;
  }

  if (typeof cell.f === 'string') {
    const match = cell.f.match(/HYPERLINK\s*\(\s*"([^"]+)"/i);
    if (match?.[1]) {
      const fromFormula = sanitizeImageUrl(match[1]);
      if (fromFormula) return fromFormula;
    }
  }

  if (typeof cell.v === 'string') {
    const fromVal = sanitizeImageUrl(cell.v);
    if (fromVal) return fromVal;
  }

  return '';
}

async function extractEmbeddedRowImages(
  buffer: ArrayBuffer,
  imageColIdx: number,
): Promise<Map<number, string>> {
  const byRow = new Map<number, string>();
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) return byRow;

    const images = ws.getImages();
    if (!images.length) return byRow;

    for (const img of images) {
      const tl = img.range?.tl as
        | {nativeRow?: number; row?: number; nativeCol?: number; col?: number}
        | undefined;
      if (!tl) continue;

      const rowIdx = Math.round(
        typeof tl.nativeRow === 'number' ? tl.nativeRow : tl.row ?? -1,
      );
      const colIdx = Math.round(
        typeof tl.nativeCol === 'number' ? tl.nativeCol : tl.col ?? -1,
      );
      if (rowIdx < 0) continue;
      if (imageColIdx >= 0 && colIdx >= 0 && Math.abs(colIdx - imageColIdx) > 1) {
        if (byRow.has(rowIdx)) continue;
      }

      const media = wb.getImage(Number(img.imageId));
      if (!media?.buffer) continue;

      const ext = (media.extension || 'png').toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      const bytes =
        media.buffer instanceof ArrayBuffer
          ? new Uint8Array(media.buffer)
          : new Uint8Array(media.buffer as Uint8Array);
      const blob = new Blob([bytes], {type: mime});
      const blobUrl = URL.createObjectURL(blob);

      if (!byRow.has(rowIdx) || colIdx === imageColIdx) {
        byRow.set(rowIdx, blobUrl);
      }
    }
  } catch (err) {
    console.warn('[garderobe] Embedded image scan skipped:', err);
  }
  return byRow;
}

export async function parseOrderXlsx(buffer: ArrayBuffer): Promise<{
  rows: OrderRow[];
  stats: OrderStats;
}> {
  const wb = XLSX.read(buffer, {type: 'array'});
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
  });

  let headerRowIdx = 0;
  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const candidate = (rawRows[r] ?? []).map((h) =>
      String(h ?? '').trim().toLowerCase(),
    );
    if (
      candidate.includes('style number') ||
      candidate.includes('style name') ||
      candidate.includes('units')
    ) {
      headerRowIdx = r;
      break;
    }
  }

  const headers = (rawRows[headerRowIdx] ?? []).map((h) => String(h ?? ''));
  const col = {
    image: findHeaderIndex(headers, [
      'Image',
      'Style Image',
      'Photo',
      'Foto',
      'Image URL',
      'Picture',
    ]),
    styleName: findHeaderIndex(headers, ['Style Name', 'Model', 'Style']),
    styleNumber: findHeaderIndex(headers, [
      'Style Number',
      'Style #',
      'Style Code',
    ]),
    colorName: findHeaderIndex(headers, ['Color Name', 'Color', 'Colore']),
    colorCode: findHeaderIndex(headers, ['Color Code', 'Color #']),
    units: findHeaderIndex(headers, ['Units', 'Qty', 'Quantity', 'Pcs']),
    value: findHeaderIndex(headers, [
      'Extended Wholesale',
      'Wholesale',
      'Value',
      'Total Value',
    ]),
    origValue: findHeaderIndex(headers, ['Original Ext. Wholesale']),
    retailer: findHeaderIndex(headers, ['Retailer', 'Customer', 'Buyer']),
    category: findHeaderIndex(headers, ['Category']),
    subcategory: findHeaderIndex(headers, ['Subcategory']),
    country: findHeaderIndex(headers, ['Country', 'Area']),
    styleTag: findHeaderIndex(headers, [
      'Style Tags',
      'StyleTags',
      'Style Tag',
      'StyleTag',
      'Tags',
      'Tag',
    ]),
  };

  const embeddedByRow = await extractEmbeddedRowImages(buffer, col.image);

  const rows: OrderRow[] = [];
  const imageByStyleColor = new Map<string, string>();
  const imageByStyle = new Map<string, string>();
  let fileRows = 0;
  let fileUnits = 0;
  let fileValue = 0;

  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const r = rawRows[i] ?? [];
    if (r.every((cell) => cell === null || cell === '')) continue;

    fileRows++;
    const units = Number(col.units >= 0 ? r[col.units] ?? 0 : 0) || 0;
    const value = Number(col.value >= 0 ? r[col.value] ?? 0 : 0) || 0;
    const origValue =
      (col.origValue >= 0 && Number(r[col.origValue] ?? 0)) || value;

    fileUnits += units;
    fileValue += value;

    const rawStyleStr = cleanStr(col.styleNumber >= 0 ? r[col.styleNumber] : '');
    const styleNumber = normalizeDigits(rawStyleStr);
    const rawStyleNumber = normalizeAlphaNum(rawStyleStr);

    const rawColorName = cleanStr(col.colorName >= 0 ? r[col.colorName] : '');
    const rawColorCode = cleanStr(col.colorCode >= 0 ? r[col.colorCode] : '');

    const colorFromCode = normalizeDigits(rawColorCode);
    const colorFromName = normalizeDigits(rawColorName);
    const colorDigits = colorFromCode || colorFromName;
    const altColorCode = colorFromName || colorFromCode;
    const displayColorName = rawColorName || rawColorCode;

    const cellImg = extractUrlFromCell(
      sheet,
      i,
      col.image,
      col.image >= 0 ? r[col.image] : '',
    );
    const image = cellImg || embeddedByRow.get(i) || '';

    const key = `${styleNumber}|${colorDigits}`;
    const styleColorTextKey = `${styleNumber || normalizeToken(rawStyleStr)}|${normalizeToken(displayColorName)}`;
    const styleKey = styleNumber || normalizeToken(rawStyleStr);

    if (image) {
      if (!imageByStyleColor.has(styleColorTextKey)) {
        imageByStyleColor.set(styleColorTextKey, image);
      }
      if (styleKey && !imageByStyle.has(styleKey)) {
        imageByStyle.set(styleKey, image);
      }
    }

    rows.push({
      styleNumber,
      rawStyleNumber,
      colorCode: colorDigits,
      altColorCode,
      key,
      styleName: cleanStr(col.styleName >= 0 ? r[col.styleName] : ''),
      colorName: displayColorName,
      units,
      value,
      origValue,
      retailer: cleanStr(col.retailer >= 0 ? r[col.retailer] : '') || '—',
      category: cleanStr(col.category >= 0 ? r[col.category] : '') || '—',
      subcategory: cleanStr(col.subcategory >= 0 ? r[col.subcategory] : '') || '—',
      country: cleanStr(col.country >= 0 ? r[col.country] : '') || '—',
      image,
      styleTag: col.styleTag >= 0 ? cleanStr(r[col.styleTag]) : '',
    });
  }

  // Backfill image across rows sharing the same Style Number + Color Name (or Style Number)
  for (const row of rows) {
    if (!row.image) {
      const styleColorTextKey = `${row.styleNumber || normalizeToken(row.styleName)}|${normalizeToken(row.colorName)}`;
      const styleKey = row.styleNumber || normalizeToken(row.styleName);
      row.image =
        imageByStyleColor.get(styleColorTextKey) ||
        imageByStyle.get(styleKey) ||
        '';
    }
  }

  return {
    rows,
    stats: {
      fileRows,
      parsedRows: rows.length,
      fileUnits,
      fileValue,
    },
  };
}
