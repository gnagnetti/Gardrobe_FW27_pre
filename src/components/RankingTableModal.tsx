import {exportTableExcel, exportTablePdf} from '../lib/exporters';
import type {ReportTableData} from '../types/garderobe';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  RemoteImage,
} from './ui/Primitives';

export function RankingTableModal({
  table,
  subtitle,
  onOpenChange,
}: {
  table: ReportTableData | null;
  subtitle: string;
  onOpenChange: (open: boolean) => void;
}) {
  if (!table) return null;

  return (
    <Dialog open={!!table} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <p className="eyebrow">{subtitle}</p>
          <DialogTitle className="font-display text-3xl">
            {table.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void exportTablePdf(
                {title: table.title, subtitle},
                table.columns,
                table.rows,
              )
            }
          >
            PDF
          </Button>
          <Button
            size="sm"
            onClick={() =>
              void exportTableExcel(
                table.title.slice(0, 28),
                table.columns,
                table.rows,
                `${table.title.toLowerCase().replace(/\s+/g, '-')}.xlsx`,
              )
            }
          >
            Excel
          </Button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gold">
              <th className="eyebrow w-14 py-2 text-left">Image</th>
              {table.columns.map((col) => (
                <th key={col} className="eyebrow py-2 text-left">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) =>
              row.variant === 'separator' ? (
                <tr key={row.id}>
                  <td
                    colSpan={table.columns.length + 1}
                    className="eyebrow border-y-2 border-gold bg-secondary py-2 text-center text-gold"
                  >
                    {String(row.cells[0] ?? '')}
                  </td>
                </tr>
              ) : (
                <tr
                  key={row.id}
                  className={
                    row.variant === 'total'
                      ? 'border-t-2 border-gold bg-secondary font-semibold'
                      : 'border-b border-border'
                  }
                >
                  <td className="py-2 pr-4">
                    {row.variant === 'total' ? null : (
                      <RemoteImage
                        src={row.image ?? ''}
                        alt={String(row.cells[0] ?? '')}
                        className="h-10 w-10 border border-border"
                      />
                    )}
                  </td>
                  {row.cells.map((cell, idx) => (
                    <td key={idx} className="py-2 pr-4 tabular-nums">
                      {typeof cell === 'number'
                        ? cell.toLocaleString('it-IT')
                        : cell}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
