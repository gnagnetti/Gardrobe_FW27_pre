import type {LookPhotoMap} from '../types/garderobe';

/**
 * Default look photos mapped by `nr_modello` (1..138) from the `fotolook` column,
 * pointing to the live root URLs on 227pre.netlify.app.
 */
export const DEFAULT_LOOK_PHOTOS: LookPhotoMap = Object.fromEntries(
  Array.from({length: 138}, (_, idx) => {
    const lookNum = String(idx + 1);
    return [lookNum, `https://227pre.netlify.app/${lookNum}.jpg`];
  }),
);
