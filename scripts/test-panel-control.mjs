import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoDe, resumenizar, seccionPendiente, ESTADOS } from '../src/lib/estado.js';
import { RESUMEN_PROJECTION, programacionDAO } from '../src/dao/programacionDAO.js';

const seccion = (extra = {}) => ({ codigo: '10.2.1', titulo: 'Introducción', bloques: [{ tipo: 'texto', texto: 'Hola' }], ...extra });

test('apartados con texto sin estructurar quedan marcados por revisar', () => {
  assert.equal(estadoDe({ secciones: [seccion({ revisar: true })] }).clave, 'porRevisar');
  assert.equal(estadoDe({ secciones: [seccion({ bloques: [] })] }).clave, 'porRevisar');
  assert.equal(estadoDe({ secciones: [seccion()] }).clave, 'lista');
});

test('cuenta los apartados pendientes y desglosa el motivo', () => {
  const estado = estadoDe({ secciones: [seccion({ revisar: true }), seccion(), seccion({ bloques: [] })] });
  assert.equal(estado.clave, 'porRevisar');
  assert.equal(estado.pendientes, 2);
  assert.deepEqual(estado.detalle, { sinEstructurar: 1, vacios: 1 });
  assert.equal(estado.etiqueta, ESTADOS.porRevisar.etiqueta);
});

test('un encabezado contenedor vacío no está pendiente: su contenido vive en los hijos', () => {
  const prog = { secciones: [
    { codigo: '10.2', titulo: 'DWES', nivel: 1, bloques: [] },
    { codigo: '10.2.1', titulo: 'Mejoras', nivel: 2, bloques: [{ tipo: 'texto', texto: 'ok' }] },
    { codigo: '10.2.3', titulo: 'Desarrollo curricular', nivel: 2, bloques: [] },
    { codigo: '10.2.3.1', titulo: 'Competencias', nivel: 3, bloques: [{ tipo: 'texto', texto: 'ok' }] },
  ]};
  const estado = estadoDe(prog);
  assert.equal(estado.clave, 'lista');
  assert.equal(estado.pendientes, 0);
});

test('el respaldo por nivel cubre numeraciones irregulares', () => {
  const prog = { secciones: [
    { codigo: '10.2-1', titulo: 'Padre', nivel: 1, bloques: [] },
    { codigo: 'otro', titulo: 'Hijo', nivel: 2, bloques: [{ tipo: 'texto', texto: 'ok' }] },
  ]};
  assert.equal(estadoDe(prog).clave, 'lista');
});

test('sin niveles numéricos el respaldo no oculta una hoja vacía', () => {
  const prog = { secciones: [
    { codigo: '10.2', titulo: 'Hoja', bloques: [] },
    { codigo: '10.2', titulo: 'Otra', bloques: [{ tipo: 'texto', texto: 'ok' }] },
  ]};
  const estado = estadoDe(prog);
  assert.equal(estado.clave, 'porRevisar');
  assert.deepEqual(estado.detalle, { sinEstructurar: 0, vacios: 1 });
});

test('exportación posterior a la última edición marca como exportada', () => {
  const estado = estadoDe({
    secciones: [seccion()],
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    exportadaEn: '2026-01-03T10:00:00.000Z',
  });
  assert.equal(estado.clave, 'exportada');
});

test('editar después de exportar vuelve a lista y señala la exportación desactualizada', () => {
  const prog = {
    secciones: [seccion()],
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-04T10:00:00.000Z',
    exportadaEn: '2026-01-03T10:00:00.000Z',
  };
  assert.equal(estadoDe(prog).clave, 'lista');
  const resumen = resumenizar(prog);
  assert.equal(resumen.exportadaDesactualizada, true);
  assert.equal(resumen.estado.clave, 'lista');
});

test('sin exportar no hay aviso de desactualización', () => {
  const resumen = resumenizar({ secciones: [seccion()], updatedAt: '2026-01-04T10:00:00.000Z' });
  assert.equal(resumen.exportadaDesactualizada, false);
  assert.equal(resumen.exportada, null);
});

test('el resumen no viaja con textos ni bloques, solo contadores', () => {
  const prog = {
    _id: '691234567890abcdef123456',
    modulo: { codigo: '0613', nombre: 'DWES', curso: '2º', profesor: 'Miguel Ángel' },
    secciones: [
      seccion({ textoOriginal: 'secreto'.repeat(100), bloques: [{ tipo: 'texto', texto: 'largo'.repeat(100) }] }),
      { codigo: '10.2.2', titulo: 'Tablas', bloques: [{ tipo: 'tabla', columnas: ['A'], filas: [['1']] }] },
    ],
    updatedAt: '2026-01-04T10:00:00.000Z',
  };
  const resumen = resumenizar(prog);
  const json = JSON.stringify(resumen);
  assert.ok(!json.includes('secreto') && !json.includes('textoOriginal') && !json.includes('bloques'));
  assert.equal(resumen._id, '691234567890abcdef123456');
  assert.equal(resumen.apartados, 2);
  assert.equal(resumen.tablas, 1);
  assert.deepEqual(resumen.modulo, prog.modulo);
  assert.equal(typeof resumen.modificada, 'number');
});

test('el listado pide a Mongo solo los campos del resumen', () => {
  assert.deepEqual(Object.keys(RESUMEN_PROJECTION).sort(), ['createdAt', 'exportadaEn', 'modulo', 'secciones', 'updatedAt']);
  assert.equal(typeof programacionDAO.findAll, 'function');
  assert.equal(typeof programacionDAO.marcarExportada, 'function');
});

test('seccionPendiente tolera apartados malformados sin romper el panel', () => {
  assert.equal(seccionPendiente(null), true);
  assert.equal(seccionPendiente({}), true);
  assert.equal(seccionPendiente({ bloques: [{ tipo: 'lista', items: [] }] }), false);
});
