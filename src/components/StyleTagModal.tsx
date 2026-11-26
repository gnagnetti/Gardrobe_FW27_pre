import {useMemo, useState} from 'react';
import {extractUniqueStyleTags, rankStylesByTags} from '../lib/analysis';
import {exportTableExcel, exportTablePdf} from '../lib/exporters';
import type {OrderRow, RefRow, ReportTableRow} from '../types/garderobe';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  RemoteImage,
} from './ui/Primitives';

const EXPORT_COLUMNS = ['#', 'Model', 'Color', 'StyleTag', 'Sold (pcs)'];

export function StyleTagModal({
  open,
  onOpenChange,
  orders,
  refRows,
  subtitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: OrderRow[];
  refRows: RefRow[];
  subtitle: string;
}) {
  const availableTags = useMemo(
    () => extractUniqueStyleTags(orders, refRows),
    [orders, refRows],
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showResults, setShowResults] = useState(false);

  const ranked = useMemo(
    () => (showResults ? rankStylesByTags(orders, refRows, selectedTags) : []),
    [showResults, orders, refRows, selectedTags],
  );

  const allSelected =
    availableTags.length > 0 && selectedTags.length === availableTags.length;

  const exportRows: ReportTableRow[] = ranked.map((item, idx) => ({
    id: `tag-${item.key}-${idx}`,
    image: item.photo,
    cells: [
      idx + 1,
      item.model,
      item.color,
      item.tags.join(', '),
      item.units,
    ],
  }));

  const handleCloseResults = () => {
    setShowResults(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open && !showResults} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <p className="eyebrow">{subtitle}</p>
            <DialogTitle className="font-display text-3xl">
              Select StyleTags
            </DialogTitle>
          </DialogHeader>

          {availableTags.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No StyleTag values found in the current dataset.
            </p>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-3 border-b border-border pb-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    setSelectedTags(checked ? [...availableTags] : [])
                  }
                />
                <span className="eyebrow">
                  {allSelected ? 'Deselect all' : 'Select all'}
                </span>
              </label>

              <div className="space-y-2">
                {availableTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-3 text-sm"
                  >
                    <Checkbox
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={(checked) =>
                        setSelectedTags((prev) =>
                          checked
                            ? [...prev, tag]
                            : prev.filter((item) => item !== tag),
                        )
                      }
                    />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          <Button
            className="mt-4 w-full"
            disabled={selectedTags.length === 0}
            onClick={() => setShowResults(true)}
          >
            Generate StyleTag Report
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showResults}
        onOpenChange={(nextOpen) => (!nextOpen ? handleCloseResults() : null)}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-5xl overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <p className="eyebrow">
              {subtitle} · {selectedTags.join(', ')}
            </p>
            <DialogTitle className="font-display text-3xl">
              StyleTag Sales Ranking
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowResults(false)}
            >
              Change tags
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void exportTablePdf(
                  {title: 'StyleTag Sales Ranking', subtitle},
                  EXPORT_COLUMNS,
                  exportRows,
                )
              }
            >
              Export PDF
            </Button>
            <Button
              size="sm"
              onClick={() =>
                void exportTableExcel(
                  'StyleTag Ranking',
                  EXPORT_COLUMNS,
                  exportRows,
                  'styletag-sales-ranking.xlsx',
                )
              }
            >
              Export XLS
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ranked.map((item, idx) => (
              <article
                key={item.key}
                className="flex min-w-0 gap-3 border border-border bg-card p-3"
              >
                <RemoteImage
                  src={item.photo}
                  alt={item.model}
                  className="h-24 w-20 shrink-0 border border-border"
                />
                <div className="min-w-0">
                  <p className="eyebrow text-gold tabular-nums">#{idx + 1}</p>
                  <p className="truncate font-display text-lg">{item.model}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.category} · {item.color}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {item.tags.join(', ')}
                  </p>
                  <p className="mt-2 font-display text-xl text-gold tabular-nums">
                    Sold: {item.units.toLocaleString('it-IT')} pcs
                  </p>
                </div>
              </article>
            ))}

            {ranked.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No models matched the selected StyleTags.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
