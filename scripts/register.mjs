import { register } from 'node:module';

// Activa el loader que resuelve imports relativos sin extensión.
register('./loader.mjs', import.meta.url);