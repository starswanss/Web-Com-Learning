// sharp ships its own typings, but they don't resolve under this project's
// module-resolution + "exports" map. A thin ambient declaration keeps the build
// type-checking (the few methods we use are exercised at runtime).
declare module 'sharp';
