import {useEffect, useMemo, useRef, useState} from 'react';
import {Toaster, toast} from 'sonner';
import {GarderobeDetailModal} from './components/GarderobeDetailModal';
import {RankingTableModal} from './components/RankingTableModal';
import {SanityCheckModal} from './components/SanityCheckModal';
import {StyleTagModal} from './components/StyleTagModal';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/Primitives';
import {
  aggregateStyleColors,
  aggregateStyles,
  analyzeCollection,
  buildSanityReport,
  checkShareIntegrity,
  computeValueShare,
  excludeAccessories,
  filterOrders,
  getCategoryStats,
  getUniqueCountries,
  verifyStyleAggregation,
  verifyStyleColorAggregation,
} from './lib/analysis';
import {exportFullExcel, exportSummaryPdf} from './lib/exporters';
import {DEFAULT_LOOK_PHOTOS} from './lib/defaultLookPhotos';
import {
  STORAGE_KEY,
  formatEuro,
  normalizeRefRows,
  parseOrderXlsx,
  parseReferenceCsv,
  sanitizeImageUrl,
} from './lib/parsers';
import {createSampleDataset} from './lib/sampleData';
import type {
  CustomMappingMap,
  CustomMappingTarget,
  GarderobeAnalysis,
  LookAnalysis,
  LookPhotoMap,
  MarketArea,
  OrderRow,
  OrderStats,
  RefRow,
  ReportTableData,
  ReportTableRow,
} from './types/garderobe';

const MAPPINGS_STORAGE_KEY = 'garderobe.mappings.v1';
const LOOK_PHOTOS_STORAGE_KEY = 'garderobe.lookPhotos.v1';

function KpiCard({value, label}: {value: string; label: string}) {
  return (
    <div className="border border-border bg-card px-6 py-10 text-center">
      <p className="font-display text-4xl text-gold tabular-nums">{value}</p>
      <p className="eyebrow mt-2">{label}</p>
    </div>
  );
}

export default function App() {
  const [refRows, setRefRows] = useState<RefRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [area, setArea] = useState<MarketArea>('all');
  const [country, setCountry] = useState<string | null>(null);
  const [selectedGarderobeGr, setSelectedGarderobeGr] = useState<string | null>(
    null,
  );
  const [sanityOpen, setSanityOpen] = useState(false);
  const [activeTable, setActiveTable] = useState<ReportTableData | null>(null);
  const [styleTagOpen, setStyleTagOpen] = useState(false);
  const [customMappings, setCustomMappings] = useState<CustomMappingMap>({});
  const [lookPhotoOverrides, setLookPhotoOverrides] = useState<LookPhotoMap>({});
  const [isSampleMode, setIsSampleMode] = useState(false);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = normalizeRefRows(JSON.parse(saved) as RefRow[]);
        setRefRows(parsed);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    const savedMappings = localStorage.getItem(MAPPINGS_STORAGE_KEY);
    if (savedMappings) {
      try {
        setCustomMappings(JSON.parse(savedMappings) as CustomMappingMap);
      } catch {
        localStorage.removeItem(MAPPINGS_STORAGE_KEY);
      }
    }
    const savedLookPhotos = localStorage.getItem(LOOK_PHOTOS_STORAGE_KEY);
    if (savedLookPhotos) {
      try {
        const parsed = JSON.parse(savedLookPhotos) as LookPhotoMap;
        const cleaned: LookPhotoMap = {};
        for (const [k, v] of Object.entries(parsed)) {
          const url = sanitizeImageUrl(v);
          if (url) cleaned[k] = url;
        }
        setLookPhotoOverrides(cleaned);
      } catch {
        localStorage.removeItem(LOOK_PHOTOS_STORAGE_KEY);
      }
    }
  }, []);

  const persistMappings = (next: CustomMappingMap) => {
    setCustomMappings(next);
    try {
      localStorage.setItem(MAPPINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const persistLookPhotos = (next: LookPhotoMap) => {
    setLookPhotoOverrides(next);
    try {
      localStorage.setItem(LOOK_PHOTOS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const filteredOrders = useMemo(
    () => filterOrders(orders, area, country),
    [orders, area, country],
  );

  const activeLookPhotoFallbacks = useMemo(
    () => (isSampleMode ? {} : DEFAULT_LOOK_PHOTOS),
    [isSampleMode],
  );

  const analysis = useMemo(
    () =>
      analyzeCollection(
        refRows,
        filteredOrders,
        customMappings,
        lookPhotoOverrides,
        activeLookPhotoFallbacks,
      ),
    [
      refRows,
      filteredOrders,
      customMappings,
      lookPhotoOverrides,
      activeLookPhotoFallbacks,
    ],
  );

  const selectedGarderobe = useMemo(
    () =>
      selectedGarderobeGr
        ? (analysis.garderobes.find((g) => g.gr === selectedGarderobeGr) ?? null)
        : null,
    [analysis.garderobes, selectedGarderobeGr],
  );

  const uniqueCountries = useMemo(() => getUniqueCountries(orders), [orders]);

  const countryOptions = useMemo(() => {
    const list = [...uniqueCountries];
    const russiaIdx = list.findIndex((c) => c.toLowerCase() === 'russia');
    const serbiaIdx = list.findIndex((c) => c.toLowerCase() === 'serbia');
    if (russiaIdx === -1) {
      if (serbiaIdx === -1) list.push('Russia + Bosco');
      else list.splice(serbiaIdx, 0, 'Russia + Bosco');
    } else {
      list.splice(russiaIdx + 1, 0, 'Russia + Bosco');
    }
    return list;
  }, [uniqueCountries]);

  const marketSharePct = useMemo(
    () => computeValueShare(filteredOrders, orders),
    [filteredOrders, orders],
  );

  useEffect(() => {
    if (orders.length) checkShareIntegrity(orders);
  }, [orders]);

  const sanityReport = useMemo(
    () =>
      orderStats
        ? buildSanityReport(
            orders,
            orderStats,
            analyzeCollection(
              refRows,
              orders,
              customMappings,
              lookPhotoOverrides,
              activeLookPhotoFallbacks,
            ),
          )
        : null,
    [
      orders,
      orderStats,
      refRows,
      customMappings,
      lookPhotoOverrides,
      activeLookPhotoFallbacks,
    ],
  );

  const marketLabel =
    country ||
    (area === 'russia_cis'
      ? 'Russia & CIS (incl. Italy)'
      : area === 'row'
        ? 'Rest of World'
        : 'All markets');

  async function handleCsvUpload(file: File) {
    let parsed: RefRow[];
    try {
      parsed = parseReferenceCsv(await file.text());
    } catch (err) {
      console.error(err);
      toast.error(
        'Could not read this CSV. Expected a ";" separated collection index.',
      );
      return;
    }

    setIsSampleMode(false);
    setRefRows(parsed);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      toast.warning('Reference too large to persist on this device.');
    }
    toast.success(`Reference database loaded — ${parsed.length} rows.`);
  }

  async function handleOrderUpload(file: File) {
    let parsed: {rows: OrderRow[]; stats: OrderStats};
    try {
      parsed = await parseOrderXlsx(await file.arrayBuffer());
    } catch (err) {
      console.error(err);
      toast.error('Could not read this Excel order file.');
      return;
    }

    setOrders(parsed.rows);
    setOrderStats(parsed.stats);
    setArea('all');
    setCountry(null);
    toast.success(
      `Order loaded — ${parsed.rows.length} rows, ${parsed.stats.fileUnits} pcs.`,
    );
  }

  function handleLoadSample() {
    const sample = createSampleDataset();
    setIsSampleMode(true);
    setRefRows(sample.refRows);
    setOrders(sample.orders);
    setOrderStats(sample.stats);
    setArea('all');
    setCountry(null);
    toast.success(
      `Sample collection loaded — ${sample.refRows.length} index rows, ${sample.stats.fileUnits} pcs.`,
    );
  }

  const hasData = refRows.length > 0 && orders.length > 0;

  const getLookPhoto = (look: LookAnalysis) =>
    look.lookPhoto ||
    look.items.find((i) => i.matched && i.ref.photo)?.ref.photo ||
    look.items.find((i) => i.ref.photo)?.ref.photo ||
    '';

  const getGarderobePhoto = (gr: GarderobeAnalysis) =>
    gr.looks.map(getLookPhoto).find(Boolean) ?? '';

  const getOrderPhoto = (rows: OrderRow[]) =>
    rows.find((r) => r.image)?.image ?? '';

  const primaryReports: Array<{label: string; build: () => ReportTableData}> = [
    {
      label: 'Top by Category',
      build: () => ({
        title: 'Top by Category',
        columns: ['Category', 'Units', 'Value'],
        rows: getCategoryStats(filteredOrders).map((cat) => ({
          id: `cat-${cat.name}`,
          image: getOrderPhoto(
            filteredOrders.filter(
              (r) => `${r.category} · ${r.subcategory}` === cat.name,
            ),
          ),
          cells: [cat.name, cat.units, formatEuro(cat.value)],
        })),
      }),
    },
    {
      label: 'Top Purchased Looks',
      build: () => ({
        title: 'Top Purchased Looks',
        columns: ['Look', 'Garderobe', 'Completeness', 'Units', 'Value'],
        rows: [...analysis.looks]
          .sort((a, b) => b.units - a.units)
          .slice(0, 50)
          .map((look) => ({
            id: `look-${look.look}`,
            image: getLookPhoto(look),
            cells: [
              `Look ${look.look}`,
              `GR ${look.gr}`,
              `${look.completeness.toFixed(0)}%`,
              look.units,
              formatEuro(look.value),
            ],
          })),
      }),
    },
    {
      label: 'Top Garderobes by Quantity',
      build: () => ({
        title: 'Top Garderobes by Quantity',
        columns: [
          'Garderobe',
          'Complete looks',
          'Completeness',
          'Units',
          'Value',
        ],
        rows: [...analysis.garderobes]
          .sort((a, b) => b.units - a.units)
          .map((gr) => ({
            id: `gr-${gr.gr}`,
            image: getGarderobePhoto(gr),
            cells: [
              `GR ${gr.gr}`,
              `${gr.completeLooks}/${gr.looks.length}`,
              `${gr.completeness.toFixed(1)}%`,
              gr.units,
              formatEuro(gr.value),
            ],
          })),
      }),
    },
    {
      label: 'By Country / Area',
      build: () => {
        const byCountry = new Map<string, OrderRow[]>();
        for (const row of filteredOrders) {
          const arr = byCountry.get(row.country) ?? [];
          arr.push(row);
          byCountry.set(row.country, arr);
        }
        return {
          title: 'By Country / Area',
          columns: ['Country', 'Retailers', 'Units', 'Value'],
          rows: [...byCountry.entries()]
            .map(([name, rows]) => ({
              id: `country-${name}`,
              image: getOrderPhoto(rows),
              units: rows.reduce((s, r) => s + r.units, 0),
              cells: [
                name,
                new Set(rows.map((r) => r.retailer)).size,
                rows.reduce((s, r) => s + r.units, 0),
                formatEuro(rows.reduce((s, r) => s + r.value, 0)),
              ],
            }))
            .sort((a, b) => b.units - a.units)
            .map(({id, image, cells}) => ({id, image, cells})),
        };
      },
    },
  ];

  const apparelOrders = useMemo(
    () => excludeAccessories(filteredOrders, refRows),
    [filteredOrders, refRows],
  );

  const styleStats = useMemo(
    () => aggregateStyles(apparelOrders, refRows),
    [apparelOrders, refRows],
  );

  useEffect(() => {
    if (apparelOrders.length) {
      verifyStyleAggregation(apparelOrders, styleStats);
    }
  }, [apparelOrders, styleStats]);

  const styleColorStats = useMemo(
    () => aggregateStyleColors(filteredOrders, refRows),
    [filteredOrders, refRows],
  );

  useEffect(() => {
    if (filteredOrders.length) {
      verifyStyleColorAggregation(filteredOrders, styleColorStats);
    }
  }, [filteredOrders, styleColorStats]);

  const styleColumns = [
    '#',
    'Style Name',
    'GR',
    'Units',
    'Total Value (€)',
    '% Share',
  ];

  const buildTotalRow = (
    id: string,
    label: string,
    items: Array<{units: number; value: number}>,
  ): ReportTableRow => ({
    id,
    image: '',
    variant: 'total',
    cells: [
      '',
      label,
      '',
      items.reduce((s, i) => s + i.units, 0),
      formatEuro(items.reduce((s, i) => s + i.value, 0)),
      '100.0%',
    ],
  });

  const buildStyleReport = (
    title: string,
    sortBy: 'units' | 'value',
  ): ReportTableData => {
    const sorted = [...styleStats].sort((a, b) => b[sortBy] - a[sortBy]);
    const top = sorted.slice(0, 15);
    const bottom = sorted.length > 20 ? sorted.slice(-5) : [];

    const toRow = (
      item: (typeof styleStats)[number],
      rank: number,
    ): ReportTableRow => ({
      id: `style-${sortBy}-${rank}-${item.styleName}`,
      image: item.image,
      cells: [
        rank,
        item.styleName,
        `GR ${item.gr}`,
        item.units,
        formatEuro(item.value),
        `${item.share.toFixed(1)}%`,
      ],
    });

    return {
      title,
      columns: styleColumns,
      rows: [
        ...top.map((item, idx) => toRow(item, idx + 1)),
        ...(bottom.length
          ? [
              {
                id: `style-${sortBy}-sep`,
                image: '',
                variant: 'separator' as const,
                cells: [`Bottom ${bottom.length} — lowest performers`],
              },
              ...bottom.map((item, idx) =>
                toRow(item, sorted.length - bottom.length + idx + 1),
              ),
            ]
          : []),
        buildTotalRow(`style-${sortBy}-total`, 'TOTAL COLLECTION', styleStats),
      ],
    };
  };

  const secondaryReports: Array<{label: string; build: () => ReportTableData}> =
    [
      {
        label: 'Best and Worst Look by pcs',
        build: () => {
          const sorted = [...analysis.looks].sort((a, b) => b.units - a.units);
          const combined = [...sorted.slice(0, 10), ...sorted.slice(-10)];
          return {
            title: 'Best and Worst Look by pcs',
            columns: ['Rank', 'Look', 'Garderobe', 'Units', 'Value'],
            rows: combined.map((look, idx) => ({
              id: `bw-pcs-${idx}-${look.look}`,
              image: getLookPhoto(look),
              cells: [
                idx < 10 ? `Best ${idx + 1}` : `Worst ${combined.length - idx}`,
                `Look ${look.look}`,
                `GR ${look.gr}`,
                look.units,
                formatEuro(look.value),
              ],
            })),
          };
        },
      },
      {
        label: 'Best and Worst Look by value',
        build: () => {
          const sorted = [...analysis.looks].sort((a, b) => b.value - a.value);
          const combined = [...sorted.slice(0, 10), ...sorted.slice(-10)];
          return {
            title: 'Best and Worst Look by value',
            columns: ['Rank', 'Look', 'Garderobe', 'Value', 'Units'],
            rows: combined.map((look, idx) => ({
              id: `bw-val-${idx}-${look.look}`,
              image: getLookPhoto(look),
              cells: [
                idx < 10 ? `Best ${idx + 1}` : `Worst ${combined.length - idx}`,
                `Look ${look.look}`,
                `GR ${look.gr}`,
                formatEuro(look.value),
                look.units,
              ],
            })),
          };
        },
      },
      {
        label: 'Best and Worst Style by pcs',
        build: () => buildStyleReport('Best and Worst Style by pcs', 'units'),
      },
      {
        label: 'Best and Worst Style by value',
        build: () => buildStyleReport('Best and Worst Style by value', 'value'),
      },
      {
        label: 'Collection Style Color Analysis',
        build: () => ({
          title: 'Collection Style Color Analysis',
          columns: [
            '#',
            'Style Name / Color',
            'GR',
            'Units',
            'Total Value (€)',
            '% Share',
          ],
          rows: [
            ...styleColorStats.map((item, idx) => ({
              id: `sc-${idx}-${item.styleName}-${item.colorName}`,
              image: item.image,
              cells: [
                idx + 1,
                item.label,
                `GR ${item.gr}`,
                item.units,
                formatEuro(item.value),
                `${item.share.toFixed(1)}%`,
              ],
            })),
            buildTotalRow('sc-total', 'TOTAL COLLECTION', styleColorStats),
          ],
        }),
      },
    ];

  return (
    <main className="min-h-screen bg-background">
      <Toaster position="bottom-right" richColors />

      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleCsvUpload(file);
          e.target.value = '';
        }}
      />
      <input
        ref={xlsxInputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleOrderUpload(file);
          e.target.value = '';
        }}
      />

      <header className="mx-auto max-w-6xl px-6 pb-10 pt-16 text-center">
        <p className="eyebrow">Collection Intelligence</p>
        <h1 className="mt-4 font-display text-6xl tracking-tight md:text-7xl">
          Garderobe
        </h1>
        <div className="mx-auto my-6 h-px w-64 bg-gold" />
        <p className="mx-auto max-w-xl text-muted-foreground">
          Cross-reference your collection index with a buyer order to reveal
          complete looks, missing pieces and the garderobes that sell.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
          >
            Upload Reference Database (.csv)
          </Button>
          <Button onClick={() => xlsxInputRef.current?.click()}>
            Upload Order (.xlsx)
          </Button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {refRows.length
            ? `Reference database active — ${refRows.length} rows stored on this device.`
            : 'No reference database yet.'}
        </p>

        {hasData && (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSanityOpen(true)}
            >
              Sanity Check
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Area Manager: {marketLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-96 overflow-y-auto">
                <DropdownMenuLabel>Area</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setArea('all');
                    setCountry(null);
                  }}
                >
                  All markets
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setArea('russia_cis');
                    setCountry(null);
                  }}
                >
                  Russia &amp; CIS (incl. Italy)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setArea('row');
                    setCountry(null);
                  }}
                >
                  Rest of World
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Country</DropdownMenuLabel>
                {countryOptions.map((item) => (
                  <DropdownMenuItem
                    key={item}
                    onClick={() => {
                      setArea('all');
                      setCountry(item);
                    }}
                  >
                    {item}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.info('Generating PDF with images…');
                void exportSummaryPdf(analysis, {
                  title: 'Collection Summary',
                  subtitle: `Market: ${marketLabel}`,
                });
              }}
            >
              Summary PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.info('Building workbook…');
                void exportFullExcel(
                  analysis,
                  filteredOrders,
                  'garderobe-analysis.xlsx',
                );
              }}
            >
              Full Excel
            </Button>
          </div>
        )}
      </header>

      {hasData ? (
        <div className="mx-auto max-w-6xl px-6 pb-24">
          <h2 className="mb-6 text-center font-display text-3xl tracking-[0.2em]">
            {analysis.retailers} RETAILERS{' '}
            <span className="text-gold tabular-nums">
              ({marketSharePct.toFixed(marketSharePct >= 99.995 ? 0 : 1)}% of
              total value)
            </span>
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              value={`${analysis.overallCompleteness.toFixed(1)}%`}
              label="Overall completion"
            />
            <KpiCard
              value={String(analysis.completeLooks)}
              label="Complete looks"
            />
            <div className="border border-border bg-card px-6 py-8 text-center">
              <p className="font-display text-3xl text-gold tabular-nums">
                {analysis.units.toLocaleString('it-IT')} pcs
              </p>
              <p className="eyebrow mt-1">Units in scope</p>
              <div className="my-4 h-px bg-border" />
              <p className="font-display text-3xl text-gold tabular-nums">
                {formatEuro(analysis.value)}
              </p>
              <p className="eyebrow mt-1">Wholesale value</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {primaryReports.map((report) => (
              <Button
                key={report.label}
                variant="secondary"
                size="sm"
                onClick={() => setActiveTable(report.build())}
              >
                {report.label}
              </Button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {secondaryReports.map((report) => (
              <Button
                key={report.label}
                variant="secondary"
                size="sm"
                onClick={() => setActiveTable(report.build())}
              >
                {report.label}
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStyleTagOpen(true)}
            >
              Best and Worst Style by StyleTag
            </Button>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {analysis.garderobes.map((gr) => (
              <button
                key={gr.gr}
                type="button"
                onClick={() => setSelectedGarderobeGr(gr.gr)}
                className="cursor-pointer border border-border bg-card p-6 text-left transition-colors hover:border-gold"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-3xl">
                    Garderobe {gr.gr}
                  </span>
                  <span className="font-display text-2xl text-gold tabular-nums">
                    {gr.completeness.toFixed(0)}%
                  </span>
                </div>
                <div className="my-3 h-px bg-gold" />
                <p className="eyebrow tabular-nums">
                  {gr.looks.length} looks · {gr.completeLooks} complete ·{' '}
                  {gr.units} pcs · {formatEuro(gr.value)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="pb-24 text-center">
          <p className="text-sm text-muted-foreground">
            Upload the collection reference (.csv) and a buyer order (.xlsx) to
            begin.
          </p>
          <button
            type="button"
            onClick={handleLoadSample}
            className="mt-4 cursor-pointer text-xs tracking-widest uppercase text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Load sample collection
          </button>
        </div>
      )}

      <GarderobeDetailModal
        garderobe={selectedGarderobe}
        subtitle={`Market: ${marketLabel}`}
        onOpenChange={(open) => !open && setSelectedGarderobeGr(null)}
        lookPhotoOverrides={lookPhotoOverrides}
        onSetLookPhoto={(lookId, url) => {
          const next = {...lookPhotoOverrides};
          const normalized = lookId.trim().replace(/^0+/, '');
          if (url === null) {
            delete next[lookId];
            if (normalized !== lookId) delete next[normalized];
          } else {
            next[lookId] = url;
          }
          persistLookPhotos(next);
        }}
      />

      <SanityCheckModal
        report={sanityReport}
        open={sanityOpen}
        onOpenChange={setSanityOpen}
        looks={analysis.looks}
        customMappings={customMappings}
        onMapStyle={(styleKey: string, target: CustomMappingTarget | null) => {
          const next = {...customMappings};
          if (target) next[styleKey] = target;
          else delete next[styleKey];
          persistMappings(next);
        }}
        onMarkAllCommercial={() => {
          if (!sanityReport?.unmatchedItems.length) return;
          const next = {...customMappings};
          for (const item of sanityReport.unmatchedItems) {
            next[item.key] = {type: 'commercial'};
          }
          persistMappings(next);
          toast.success('All unmatched styles reconciled as Off-Look / Commercial.');
        }}
        onResetMappings={() => {
          persistMappings({});
          toast.info('Custom style mappings cleared.');
        }}
      />

      <StyleTagModal
        open={styleTagOpen}
        onOpenChange={setStyleTagOpen}
        orders={filteredOrders}
        refRows={refRows}
        subtitle={`Market: ${marketLabel}`}
      />

      <RankingTableModal
        table={activeTable}
        subtitle={`Market: ${marketLabel}`}
        onOpenChange={(open) => !open && setActiveTable(null)}
      />
    </main>
  );
}
