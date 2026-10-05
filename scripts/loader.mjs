/**
 * Loader de Node para los tests.
 *
 * El proyecto usa imports sin extensión (resueltos por el bundler de Next.js),
 * que Node no resuelve en ESM. Este hook añade ".js" cuando hace falta, sin
 * tocar el código de la aplicación.
 */
export function resolve(specifier, context, nextResolve) {
  const esRelativo = specifier.startsWith('./') || specifier.startsWith('../');
  const tieneExtension = /\.[cm]?[jt]sx?$/.test(specifier);

  if (esRelativo && !tieneExtension) {
    try {
      return nextResolve(`${specifier}.js`, context);
    } catch {
      /* cae al comportamiento normal */
    }
  }

  return nextResolve(specifier, context);
}