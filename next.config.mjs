/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ambas librerías de parsing se usan en las rutas de Node y no deben empaquetarse.
  serverExternalPackages: ['pdf-parse', 'mammoth'],
};

export default nextConfig;