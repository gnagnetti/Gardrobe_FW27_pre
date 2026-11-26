import {toast} from 'sonner';
import {exportTableExcel} from '../lib/exporters';
import {formatEuro} from '../lib/parsers';
import type {
  CustomMappingMap,
  CustomMappingTarget,
  LookAnalysis,
  SanityReport,
} from '../types/garderobe';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  RemoteImage,
  cn,
} from './ui/Primitives';

function CheckRow({
  label,
  a,
  b,
  ok,
}: {
  label: string;
  a: string;
  b: string;
  ok: boolean;
}) {
  return (
    <div className="grid grid-cols-4 items-center gap-2 border-b border-border py-2 text-sm tabular-nums">
      <span className="col-span-2 text-muted-foreground">{label}</span>
      <span className="text-right">{a}</span>
      <span
        className={cn(
          'text-right font-medium',
          ok ? 'text-success' : 'text-destructive',
        )}
      >
        {b}
      </span>
    </div>
  );
}

export function SanityCheckModal({
  report,
  open,
  onOpenChange,
  looks,
  customMappings,
  onMapStyle,
  onMarkAllCommercial,
  onResetMappings,
}: {
  report: SanityReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  looks: LookAnalysis[];
  customMappings: CustomMappingMap;
  onMapStyle: (styleKey: string, target: CustomMappingTarget | null) => void;
  onMarkAllCommercial: () => void;
  onResetMappings: () => void;
}) {
  const mappedCount = Object.keys(customMappings).length;

  const handleExportUnmatched = () => {
    if (!report?.unmatchedItems.length) return;
    toast.info('Building unmatched styles workbook…');
    void exportTableExcel(
      'Unmatched Styles',
      ['Style Name', 'Style #', 'Color', 'Category', 'Units', 'Value (€)', 'Reason'],
      report.unmatchedItems.map((item, idx) => ({
        id: `unmatched-${idx}`,
        image: item.image,
        cells: [
          item.styleName,
          item.styleNumber,
          item.colorName,
          item.category,
          item.units,
          formatEuro(item.value),
          item.reason,
        ],
      })),
      'garderobe-unmatched-styles.xlsx',
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <p className="eyebrow">Data integrity</p>
          <DialogTitle className="font-display text-3xl">Sanity Check</DialogTitle>
        </DialogHeader>

        {report ? (
          <div>
            <p
              className={cn(
                'mb-4 font-display text-2xl',
                report.ok ? 'text-success' : 'text-destructive',
              )}
            >
              {report.ok
                ? '100% integrity — no data loss'
                : 'Discrepancies detected'}
            </p>
            <CheckRow
              label="Rows in file / parsed"
              a={String(report.fileRows)}
              b={String(report.parsedRows)}
              ok={report.fileRows === report.parsedRows}
            />
            <CheckRow
              label="Units in file / processed"
              a={report.fileUnits.toLocaleString('it-IT')}
              b={report.parsedUnits.toLocaleString('it-IT')}
              ok={Math.abs(report.fileUnits - report.parsedUnits) < 0.001}
            />
            <CheckRow
              label="Value in file / processed (€)"
              a={Math.round(report.fileValue).toLocaleString('it-IT')}
              b={Math.round(report.parsedValue).toLocaleString('it-IT')}
              ok={Math.abs(report.fileValue - report.parsedValue) < 0.01}
            />
            <CheckRow
              label="Units matched to collection index"
              a={report.parsedUnits.toLocaleString('it-IT')}
              b={report.matchedUnits.toLocaleString('it-IT')}
              ok={report.unmatchedUnits === 0}
            />
            <CheckRow
              label="Russia & CIS + ROW = total (units & value)"
              a={`${report.areaUnits.toLocaleString('it-IT')} pcs in CIS`}
              b={report.areaSumMatchesTotal ? 'BALANCED' : 'MISMATCH'}
              ok={report.areaSumMatchesTotal}
            />

            {report.unmatchedUnits === 0 && report.unmatchedItems.length === 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-success">
                  All ordered units matched the collection reference index.
                </p>
                {mappedCount > 0 && (
                  <Button variant="outline" size="sm" onClick={onResetMappings}>
                    Reset {mappedCount} custom mapping{mappedCount > 1 ? 's' : ''}
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold pb-3">
                  <p className="text-xs text-muted-foreground">
                    Unmatched units ({report.unmatchedUnits.toLocaleString('it-IT')})
                    across {report.unmatchedItems.length} ordered style-color rows —
                    assign them to a Look or mark as Off-Look / Commercial to reconcile.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mappedCount > 0 && (
                      <Button variant="outline" size="sm" onClick={onResetMappings}>
                        Reset mappings
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onMarkAllCommercial}
                    >
                      Reconcile all as Off-Look
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportUnmatched}
                    >
                      Export Unmatched (.xlsx)
                    </Button>
                  </div>
                </div>

                <div className="mt-3 max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="eyebrow py-1.5 pr-2">Image</th>
                        <th className="eyebrow py-1.5 pr-2">Style</th>
                        <th className="eyebrow py-1.5 pr-2">Style #</th>
                        <th className="eyebrow py-1.5 pr-2">Color</th>
                        <th className="eyebrow py-1.5 pr-2 text-right">Units</th>
                        <th className="eyebrow py-1.5 pr-2 text-right">Value</th>
                        <th className="eyebrow py-1.5 text-right">Reconcile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.unmatchedItems.map((item, idx) => {
                        const current = customMappings[item.key];
                        const currentVal = current
                          ? current.type === 'commercial'
                            ? 'commercial'
                            : `look:${current.look}`
                          : '';
                        return (
                          <tr key={`${item.key}-${idx}`} className="border-b border-border">
                            <td className="py-1.5 pr-2">
                              <RemoteImage
                                src={item.image}
                                alt={item.styleName}
                                className="h-8 w-8 border border-border"
                              />
                            </td>
                            <td className="py-1.5 pr-2 font-medium">
                              {item.styleName}
                            </td>
                            <td className="py-1.5 pr-2 text-muted-foreground tabular-nums">
                              {item.styleNumber}
                            </td>
                            <td className="py-1.5 pr-2 text-muted-foreground">
                              {item.colorName}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {item.units.toLocaleString('it-IT')}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                              {formatEuro(item.value)}
                            </td>
                            <td className="py-1.5 text-right">
                              <select
                                aria-label={`Reconcile ${item.styleName}`}
                                value={currentVal}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) {
                                    onMapStyle(item.key, null);
                                  } else if (v === 'commercial') {
                                    onMapStyle(item.key, {type: 'commercial'});
                                  } else if (v.startsWith('look:')) {
                                    onMapStyle(item.key, {
                                      type: 'look',
                                      look: v.slice(5),
                                    });
                                  }
                                }}
                                className="max-w-[160px] rounded border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                <option value="">Unmatched</option>
                                <option value="commercial">
                                  Off-Look / Commercial
                                </option>
                                {looks.map((l) => (
                                  <option key={l.look} value={`look:${l.look}`}>
                                    Look {l.look} (GR {l.gr})
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Upload an order file first.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
