/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ambas librerías de parsing se usan en las rutas de Node y no deben empaquetarse.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'mammoth'],
  // Orígenes extra permitidos en `next dev` (el HMR/assets del dev server se bloquean por defecto).
  // Solo el hostname: sin http:// y sin puerto.
  allowedDevOrigins: ['10.112.200.172'],
};

export default nextConfig;
