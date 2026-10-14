// Pictures imported as modules (the greeting's skies, weather-photo.tsx).
// next-env.d.ts brings these types in too, but it is written by `next dev`
// and `next build` and is not kept in the repository, so a fresh checkout —
// CI type-checks before it builds — would not know a .webp at all.
/// <reference types="next/image-types/global" />
