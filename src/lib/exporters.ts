import ExcelJS from 'exceljs';
import {jsPDF} from 'jspdf';
import type {
  CollectionAnalysis,
  LookAnalysis,
  OrderRow,
  ReportTableRow,
} from '../types/garderobe';

interface CachedImage {
  dataUrl: string;
  buffer: ArrayBuffer;
  extension: 'png' | 'jpeg';
  placeholder: boolean;
}

const PLACEHOLDER_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPU0DD4DwACWwFbtc0Y0AAAAABJRU5ErkJggg==';

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

const PLACEHOLDER_IMAGE: CachedImage = {
  dataUrl: `data:image/png;base64,${PLACEHOLDER_B64}`,
  buffer: base64ToArrayBuffer(PLACEHOLDER_B64),
  extension: 'png',
  placeholder: true,
};

const imageCache = new Map<string, Promise<CachedImage>>();

export function getDisplayImageUrl(src: string): string {
  if (!src) return '';
  if (
    src.startsWith('/src/assets/') ||
    src.startsWith('data:') ||
    src.startsWith('blob:')
  ) {
    return src;
  }
  return `/api/public/img?url=${encodeURIComponent(src)}`;
}

async function fetchBlobAsCachedImage(url: string): Promise<CachedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) return null;
    const buffer = await blob.arrayBuffer();
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return null;
    return {
      dataUrl,
      buffer,
      extension: blob.type.includes('png') ? 'png' : 'jpeg',
      placeholder: false,
    };
  } catch {
    return null;
  }
}

async function fetchImageAsset(src: string): Promise<CachedImage> {
  const proxied = getDisplayImageUrl(src);
  const fromProxy = await fetchBlobAsCachedImage(proxied);
  if (fromProxy) return fromProxy;
  if (proxied !== src) {
    const fromDirect = await fetchBlobAsCachedImage(src);
    if (fromDirect) return fromDirect;
  }
  return PLACEHOLDER_IMAGE;
}

export function loadImageAsset(src: string): Promise<CachedImage> {
  if (!src) return Promise.resolve(PLACEHOLDER_IMAGE);
  const existing = imageCache.get(src);
  if (existing) return existing;
  const promise = fetchImageAsset(src);
  imageCache.set(src, promise);
  return promise;
}

const GOLD_RGB: [number, number, number] = [158, 124, 56];
const ESPRESSO_RGB: [number, number, number] = [43, 32, 24];
const MUTED_RGB: [number, number, number] = [122, 106, 90];

function drawPdfHeader(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(...ESPRESSO_RGB);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(240, 232, 218);
  doc.setFont('times', 'normal');
  doc.setFontSize(22);
  doc.text('Garderobe', 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(...GOLD_RGB);
  doc.text(title.toUpperCase(), 14, 23);
  doc.setTextColor(...MUTED_RGB);
  doc.setFontSize(8);
  doc.text(subtitle, 196, 23, {align: 'right'});
  doc.setTextColor(...ESPRESSO_RGB);
}

function ensurePdfSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  title: string,
  subtitle: string,
): number {
  if (y + needed > 285) {
    doc.addPage();
    drawPdfHeader(doc, title, subtitle);
    return 42;
  }
  return y;
}

export async function exportGarderobePdf(
  looks: LookAnalysis[],
  meta: {title: string; subtitle: string},
  includeImages = true,
) {
  const doc = new jsPDF();
  drawPdfHeader(doc, meta.title, meta.subtitle);
  let y = 42;

  for (const look of looks) {
    y = ensurePdfSpace(doc, y, 46, meta.title, meta.subtitle);
    doc.setFont('times', 'normal');
    doc.setFontSize(16);
    doc.text(`Look ${look.look}`, 14, y);
    doc.setFontSize(10);
    doc.setTextColor(...GOLD_RGB);
    doc.text(
      `${look.completeness.toFixed(0)}%  ·  GR ${look.gr}  ·  ${look.units} pcs  ·  EUR ${Math.round(look.value).toLocaleString('it-IT')}`,
      196,
      y,
      {align: 'right'},
    );
    doc.setTextColor(...ESPRESSO_RGB);
    doc.setDrawColor(...GOLD_RGB);
    doc.line(14, y + 2, 196, y + 2);
    y += 8;

    let x = 14;
    if (includeImages && look.lookPhoto) {
      const lookImg = await loadImageAsset(look.lookPhoto);
      if (!lookImg.placeholder) {
        try {
          doc.addImage(
            lookImg.dataUrl,
            lookImg.extension.toUpperCase(),
            x,
            y,
            22,
            22 * 1.25,
          );
        } catch {
          // ignore unsupported image decode
        }
      }
      doc.setDrawColor(...GOLD_RGB);
      doc.rect(x, y, 22, 22 * 1.25);
      doc.setFontSize(6);
      doc.setTextColor(...GOLD_RGB);
      doc.text(`LOOK ${look.look}`, x, y + 22 * 1.25 + 3);
      doc.setTextColor(...ESPRESSO_RGB);
      x += 26;
    }

    for (const item of look.items) {
      if (x + 22 > 196) {
        x = 14;
        y += 34;
        y = ensurePdfSpace(doc, y, 34, meta.title, meta.subtitle);
      }

      if (includeImages && item.ref.photo) {
        const img = await loadImageAsset(item.ref.photo);
        if (!img.placeholder) {
          try {
            doc.addImage(
              img.dataUrl,
              img.extension.toUpperCase(),
              x,
              y,
              22,
              22 * 1.25,
            );
          } catch {
            // ignore unsupported image decode
          }
        }
      }

      doc.setDrawColor(220, 210, 195);
      doc.rect(x, y, 22, 22 * 1.25);
      doc.setFontSize(6);
      doc.setTextColor(
        item.matched ? 40 : 170,
        item.matched ? 110 : 60,
        60,
      );
      doc.text(item.matched ? 'MATCHED' : 'MISSING', x, y + 22 * 1.25 + 3);
      doc.setTextColor(...ESPRESSO_RGB);
      doc.text(item.ref.model.slice(0, 16), x, y + 22 * 1.25 + 6.5);
      doc.setTextColor(...MUTED_RGB);
      doc.text(
        `${item.ref.specifica.slice(0, 14)} · ${item.units}pz`,
        x,
        y + 22 * 1.25 + 9.5,
      );
      doc.setTextColor(...ESPRESSO_RGB);
      x += 26;
    }

    y += 46;
  }

  doc.save(`garderobe-${meta.title.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

export async function exportTablePdf(
  meta: {title: string; subtitle: string},
  columns: string[],
  rows: ReportTableRow[],
) {
  const doc = new jsPDF();
  drawPdfHeader(doc, meta.title, meta.subtitle);

  const colWidth = 166 / columns.length;
  let y = 44;

  const drawTableHeader = () => {
    doc.setFontSize(8);
    doc.setTextColor(...GOLD_RGB);
    doc.text('IMAGE', 14, y);
    columns.forEach((col, idx) =>
      doc.text(col.toUpperCase(), 30 + idx * colWidth, y),
    );
    doc.setDrawColor(...GOLD_RGB);
    doc.line(14, y + 2, 196, y + 2);
    y += 8;
    doc.setTextColor(...ESPRESSO_RGB);
  };

  drawTableHeader();

  for (const row of rows) {
    if (y + 15 > 285) {
      doc.addPage();
      drawPdfHeader(doc, meta.title, meta.subtitle);
      y = 44;
      drawTableHeader();
    }

    if (row.variant === 'separator') {
      doc.setDrawColor(...GOLD_RGB);
      doc.line(14, y - 2, 196, y - 2);
      doc.setFontSize(8);
      doc.setTextColor(...GOLD_RGB);
      doc.text(String(row.cells[0] ?? '').toUpperCase(), 105, y + 3, {
        align: 'center',
      });
      doc.line(14, y + 6, 196, y + 6);
      doc.setTextColor(...ESPRESSO_RGB);
      y += 14;
      continue;
    }

    if (row.variant === 'total') {
      doc.setDrawColor(...GOLD_RGB);
      doc.line(14, y - 3, 196, y - 3);
      doc.setFont('times', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...ESPRESSO_RGB);
      row.cells.forEach((cell, idx) =>
        doc.text(String(cell).slice(0, 28), 30 + idx * colWidth, y + 3),
      );
      doc.setFont('times', 'normal');
      y += 15;
      continue;
    }

    const img = await loadImageAsset(row.image);
    doc.setDrawColor(225, 216, 202);
    doc.rect(14, y - 12 * 0.7, 12, 12);
    if (!img.placeholder) {
      try {
        doc.addImage(
          img.dataUrl,
          img.extension.toUpperCase(),
          14,
          y - 12 * 0.7,
          12,
          12,
        );
      } catch {
        // ignore unsupported image decode
      }
    }

    doc.setFontSize(8);
    doc.setTextColor(...ESPRESSO_RGB);
    row.cells.forEach((cell, idx) =>
      doc.text(String(cell).slice(0, 28), 30 + idx * colWidth, y),
    );
    y += 15;
  }

  doc.save(`garderobe-${meta.title.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

export async function exportSummaryPdf(
  analysis: CollectionAnalysis,
  meta: {title: string; subtitle: string},
) {
  await exportTablePdf(
    meta,
    ['Garderobe', 'Looks', 'Complete', 'Compl. %', 'Pcs', 'Value EUR'],
    analysis.garderobes.map((gr) => ({
      id: `gr-${gr.gr}`,
      image:
        gr.looks.find((l) => l.lookPhoto)?.lookPhoto ??
        gr.looks[0]?.items[0]?.ref.photo ??
        '',
      cells: [
        `GR ${gr.gr}`,
        gr.looks.length,
        gr.completeLooks,
        `${gr.completeness.toFixed(1)}%`,
        gr.units,
        Math.round(gr.value).toLocaleString('it-IT'),
      ],
    })),
  );
}

async function embedWorkbookImage(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  rowIndex: number,
  src: string,
) {
  if (!src) return;
  const img = await loadImageAsset(src);
  if (img.placeholder) return;
  const imageId = wb.addImage({
    buffer: img.buffer,
    extension: img.extension,
  });
  ws.addImage(imageId, {
    tl: {col: 0.15, row: rowIndex - 1 + 0.1},
    ext: {width: 50, height: 50},
  });
}

function styleWorkbookHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = {
    bold: true,
    color: {argb: 'FFF5EEE2'},
    name: 'Montserrat',
    size: 10,
  };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: {argb: 'FF2B2018'},
  };
  row.alignment = {vertical: 'middle'};
  row.height = 22;
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function exportGarderobeExcel(
  looks: LookAnalysis[],
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Looks');
  ws.columns = [
    {header: 'Photo', key: 'photo', width: 14},
    {header: 'Look', key: 'look', width: 10},
    {header: 'Garderobe', key: 'gr', width: 12},
    {header: 'Model', key: 'model', width: 24},
    {header: 'Type', key: 'type', width: 16},
    {header: 'Color', key: 'color', width: 14},
    {header: 'Status', key: 'status', width: 12},
    {header: 'Units', key: 'units', width: 10},
    {header: 'Value', key: 'value', width: 16},
  ];
  styleWorkbookHeader(ws);

  let rowIndex = 2;
  for (const look of looks) {
    if (look.lookPhoto) {
      const lookRow = ws.getRow(rowIndex);
      lookRow.height = 60;
      lookRow.getCell('look').value = look.look;
      lookRow.getCell('gr').value = look.gr;
      lookRow.getCell('model').value = `LOOK ${look.look}`;
      lookRow.getCell('type').value = 'Fotolook';
      lookRow.getCell('color').value = '';
      lookRow.getCell('status').value = 'LOOK';
      lookRow.getCell('status').font = {color: {argb: 'FF9E7C38'}, bold: true};
      lookRow.getCell('units').value = look.units;
      lookRow.getCell('value').value = look.value;
      lookRow.getCell('value').numFmt = '#,##0.00 "€"';
      lookRow.alignment = {vertical: 'middle'};
      await embedWorkbookImage(wb, ws, rowIndex, look.lookPhoto);
      rowIndex++;
    }
    for (const item of look.items) {
      const row = ws.getRow(rowIndex);
      row.height = 60;
      row.getCell('look').value = look.look;
      row.getCell('gr').value = look.gr;
      row.getCell('model').value = item.ref.model;
      row.getCell('type').value = item.ref.specifica;
      row.getCell('color').value = item.ref.colorCode;
      row.getCell('status').value = item.matched ? 'MATCHED' : 'MISSING';
      row.getCell('status').font = {
        color: {argb: item.matched ? 'FF1F6B3B' : 'FFA33636'},
        bold: true,
      };
      row.getCell('units').value = item.units;
      row.getCell('value').value = item.value;
      row.getCell('value').numFmt = '#,##0.00 "€"';
      row.alignment = {vertical: 'middle'};
      await embedWorkbookImage(wb, ws, rowIndex, item.ref.photo);
      rowIndex++;
    }
  }

  await downloadWorkbook(wb, filename);
}

export async function exportTableExcel(
  sheetName: string,
  columns: string[],
  rows: ReportTableRow[],
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    {header: 'IMAGE', key: 'image', width: 10},
    ...columns.map((col, idx) => ({header: col, key: `c${idx}`, width: 22})),
  ];
  styleWorkbookHeader(ws);

  let rowIndex = 2;
  for (const r of rows) {
    const row = ws.getRow(rowIndex);
    row.alignment = {vertical: 'middle'};

    if (r.variant === 'separator') {
      row.height = 20;
      row.getCell(1).value = String(r.cells[0] ?? '');
      row.font = {bold: true, color: {argb: 'FF9E7C38'}, size: 10};
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {argb: 'FFF5EEE2'},
      };
      ws.mergeCells(rowIndex, 1, rowIndex, columns.length + 1);
      row.alignment = {vertical: 'middle', horizontal: 'center'};
      row.commit();
      rowIndex++;
      continue;
    }

    if (r.variant === 'total') {
      row.height = 22;
      r.cells.forEach((cell, idx) => {
        row.getCell(`c${idx}`).value = cell;
      });
      row.font = {bold: true, color: {argb: 'FF2B2018'}, size: 10};
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {argb: 'FFEDE3D2'},
      };
      row.commit();
      rowIndex++;
      continue;
    }

    row.height = 52;
    r.cells.forEach((cell, idx) => {
      row.getCell(`c${idx}`).value = cell;
    });
    row.commit();
    await embedWorkbookImage(wb, ws, rowIndex, r.image);
    rowIndex++;
  }

  await downloadWorkbook(wb, filename);
}

export async function exportFullExcel(
  analysis: CollectionAnalysis,
  orders: OrderRow[],
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  const getLookPhoto = (look: LookAnalysis) =>
    look.lookPhoto || look.items.find((i) => i.ref.photo)?.ref.photo || '';

  const grSheet = wb.addWorksheet('Garderobes');
  grSheet.columns = [
    {header: 'IMAGE', key: 'image', width: 10},
    {header: 'Garderobe', key: 'gr', width: 14},
    {header: 'Looks', key: 'looks', width: 10},
    {header: 'Complete', key: 'complete', width: 12},
    {header: 'Completeness %', key: 'pct', width: 18},
    {header: 'Units', key: 'units', width: 12},
    {header: 'Value', key: 'value', width: 18},
  ];
  styleWorkbookHeader(grSheet);

  let grRowIdx = 2;
  for (const gr of analysis.garderobes) {
    const row = grSheet.getRow(grRowIdx);
    row.height = 52;
    row.alignment = {vertical: 'middle'};
    row.getCell('gr').value = `GR ${gr.gr}`;
    row.getCell('looks').value = gr.looks.length;
    row.getCell('complete').value = gr.completeLooks;
    row.getCell('pct').value = Number(gr.completeness.toFixed(1));
    row.getCell('units').value = gr.units;
    row.getCell('value').value = gr.value;
    await embedWorkbookImage(
      wb,
      grSheet,
      grRowIdx,
      gr.looks.map(getLookPhoto).find(Boolean) ?? '',
    );
    grRowIdx++;
  }
  grSheet.getColumn(7).numFmt = '#,##0.00 "€"';

  const lookSheet = wb.addWorksheet('Looks');
  lookSheet.columns = [
    {header: 'IMAGE', key: 'image', width: 10},
    {header: 'Look', key: 'look', width: 12},
    {header: 'Garderobe', key: 'gr', width: 12},
    {header: 'Completeness %', key: 'pct', width: 18},
    {header: 'Missing', key: 'missing', width: 40},
    {header: 'Units', key: 'units', width: 12},
    {header: 'Value', key: 'value', width: 18},
  ];
  styleWorkbookHeader(lookSheet);

  let lookRowIdx = 2;
  for (const look of analysis.looks) {
    const row = lookSheet.getRow(lookRowIdx);
    row.height = 52;
    row.alignment = {vertical: 'middle'};
    row.getCell('look').value = look.look;
    row.getCell('gr').value = look.gr;
    row.getCell('pct').value = Number(look.completeness.toFixed(1));
    row.getCell('missing').value = look.missing
      .map((m) => m.ref.model)
      .join(', ');
    row.getCell('units').value = look.units;
    row.getCell('value').value = look.value;
    await embedWorkbookImage(wb, lookSheet, lookRowIdx, getLookPhoto(look));
    lookRowIdx++;
  }
  lookSheet.getColumn(7).numFmt = '#,##0.00 "€"';

  const orderSheet = wb.addWorksheet('Order rows');
  orderSheet.columns = [
    {header: 'IMAGE', key: 'image', width: 10},
    {header: 'Style', key: 'styleName', width: 22},
    {header: 'Style #', key: 'styleNumber', width: 14},
    {header: 'Color', key: 'colorName', width: 16},
    {header: 'Retailer', key: 'retailer', width: 30},
    {header: 'Country', key: 'country', width: 16},
    {header: 'Category', key: 'category', width: 16},
    {header: 'Units', key: 'units', width: 10},
    {header: 'Value', key: 'value', width: 16},
  ];
  styleWorkbookHeader(orderSheet);

  let ordRowIdx = 2;
  for (const ord of orders) {
    const row = orderSheet.getRow(ordRowIdx);
    row.height = 52;
    row.alignment = {vertical: 'middle'};
    row.getCell('styleName').value = ord.styleName;
    row.getCell('styleNumber').value = ord.styleNumber;
    row.getCell('colorName').value = ord.colorName;
    row.getCell('retailer').value = ord.retailer;
    row.getCell('country').value = ord.country;
    row.getCell('category').value = ord.category;
    row.getCell('units').value = ord.units;
    row.getCell('value').value = ord.value;
    await embedWorkbookImage(wb, orderSheet, ordRowIdx, ord.image);
    ordRowIdx++;
  }
  orderSheet.getColumn(9).numFmt = '#,##0.00 "€"';

  await downloadWorkbook(wb, filename);
}
