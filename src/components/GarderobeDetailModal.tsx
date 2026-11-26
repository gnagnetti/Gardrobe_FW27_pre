import {useState} from 'react';
import {toast} from 'sonner';
import {exportGarderobeExcel, exportGarderobePdf} from '../lib/exporters';
import {sanitizeImageUrl} from '../lib/parsers';
import type {
  GarderobeAnalysis,
  LookAnalysis,
  LookItem,
  LookPhotoMap,
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

function LookItemCard({item}: {item: LookItem}) {
  return (
    <div className="w-32 shrink-0">
      <div className="relative">
        <RemoteImage
          src={item.ref.photo}
          alt={item.ref.model}
          className={cn(
            'h-40 w-32 border border-border',
            !item.matched && 'opacity-45 grayscale',
          )}
        />
        <span
          className={cn(
            'absolute left-0 top-0 px-1.5 py-0.5 text-[0.55rem] tracking-[0.18em]',
            item.matched
              ? 'bg-success text-cream'
              : 'bg-destructive text-destructive-foreground',
          )}
        >
          {item.matched ? 'MATCHED' : 'MISSING'}
        </span>
      </div>
      <p className="mt-2 truncate font-display text-sm">{item.ref.model}</p>
      <p className="truncate text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        {item.ref.specifica} · {item.ref.colorCode}
      </p>
      <p className="text-[0.7rem] text-gold tabular-nums">
        {item.units} pcs · € {Math.round(item.value).toLocaleString('it-IT')}
      </p>
    </div>
  );
}

function LookSection({
  look,
  hasOverride,
  onSetLookPhoto,
}: {
  look: LookAnalysis;
  hasOverride: boolean;
  onSetLookPhoto?: (lookId: string, url: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState(look.lookPhoto);

  return (
    <section className="w-full min-w-0 overflow-hidden border-t border-border py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-2xl">Look {look.look}</h3>
          {onSetLookPhoto && (
            <button
              type="button"
              onClick={() => {
                setDraftUrl(look.lookPhoto);
                setEditing((prev) => !prev);
              }}
              className="cursor-pointer text-[0.65rem] uppercase tracking-widest text-muted-foreground underline underline-offset-4 transition-colors hover:text-gold"
            >
              {editing ? 'Cancel' : 'Edit photo'}
            </button>
          )}
        </div>
        <div className="text-right">
          <p className="font-display text-2xl text-gold tabular-nums">
            {look.completeness.toFixed(0)}%
          </p>
          <p className="eyebrow tabular-nums">
            {look.apparelMatched}/{look.apparelTotal} apparel · {look.units} pcs
            · € {Math.round(look.value).toLocaleString('it-IT')}
          </p>
        </div>
      </div>

      {editing && onSetLookPhoto && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 border border-border bg-secondary/40 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = sanitizeImageUrl(draftUrl);
            if (!clean) {
              toast.error('Please enter a valid http(s) image URL.');
              return;
            }
            onSetLookPhoto(look.look, clean);
            setEditing(false);
            toast.success(`Look ${look.look} photo updated.`);
          }}
        >
          <input
            type="url"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="https://..."
            className="h-8 min-w-56 flex-1 rounded-sm border border-border bg-background px-2.5 text-xs focus:border-gold focus:outline-none"
          />
          <Button type="submit" size="sm">
            Save URL
          </Button>
          {hasOverride && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onSetLookPhoto(look.look, null);
                setEditing(false);
                toast.info(`Look ${look.look} custom photo cleared.`);
              }}
            >
              Reset
            </Button>
          )}
        </form>
      )}

      <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
        {look.lookPhoto ? (
          <div className="w-32 shrink-0">
            <div className="relative">
              <RemoteImage
                src={look.lookPhoto}
                alt={`Look ${look.look}`}
                className="h-40 w-32 border border-gold"
              />
              <span className="absolute left-0 top-0 bg-gold px-1.5 py-0.5 text-[0.55rem] tracking-[0.18em] text-cream">
                LOOK {look.look}
              </span>
            </div>
            <p className="mt-2 truncate font-display text-sm">
              Look {look.look}
            </p>
            <p className="truncate text-[0.65rem] uppercase tracking-widest text-muted-foreground">
              GR {look.gr} · Fotolook
            </p>
          </div>
        ) : null}
        {look.items.map((item, idx) => (
          <LookItemCard key={`${item.ref.key}-${idx}`} item={item} />
        ))}
      </div>

      {look.missing.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Missing to complete:{' '}
          {look.missing.map((m) => m.ref.model).join(', ')}
        </p>
      )}
    </section>
  );
}

export function GarderobeDetailModal({
  garderobe,
  subtitle,
  onOpenChange,
  lookPhotoOverrides = {},
  onSetLookPhoto,
}: {
  garderobe: GarderobeAnalysis | null;
  subtitle: string;
  onOpenChange: (open: boolean) => void;
  lookPhotoOverrides?: LookPhotoMap;
  onSetLookPhoto?: (lookId: string, url: string | null) => void;
}) {
  if (!garderobe) return null;

  return (
    <Dialog open={!!garderobe} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(72rem,95vw)] max-w-5xl grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <p className="eyebrow">Garderobe detail</p>
          <DialogTitle className="font-display text-3xl">
            Garderobe {garderobe.gr}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-6 border-y border-border py-3 text-sm tabular-nums">
          <span>
            <strong className="font-display text-xl text-gold">
              {garderobe.completeness.toFixed(1)}%
            </strong>{' '}
            completeness
          </span>
          <span>
            {garderobe.completeLooks}/{garderobe.looks.length} complete looks
          </span>
          <span>{garderobe.units} pcs</span>
          <span>€ {Math.round(garderobe.value).toLocaleString('it-IT')}</span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toast.info('Generating PDF with images…');
                void exportGarderobePdf(garderobe.looks, {
                  title: `Garderobe ${garderobe.gr}`,
                  subtitle,
                });
              }}
            >
              PDF
            </Button>
            <Button
              size="sm"
              onClick={() => {
                toast.info('Generating Excel with photos…');
                void exportGarderobeExcel(
                  garderobe.looks,
                  `garderobe-${garderobe.gr}.xlsx`,
                );
              }}
            >
              Excel
            </Button>
          </div>
        </div>

        {garderobe.looks.map((look) => (
          <LookSection
            key={look.look}
            look={look}
            hasOverride={Boolean(
              lookPhotoOverrides[look.look] ??
                lookPhotoOverrides[look.look.trim().replace(/^0+/, '')],
            )}
            onSetLookPhoto={onSetLookPhoto}
          />
        ))}
      </DialogContent>
    </Dialog>
  );
}
