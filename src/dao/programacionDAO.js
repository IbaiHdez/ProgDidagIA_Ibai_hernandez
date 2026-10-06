import { connectToDatabase } from '../lib/mongodb.js';
import Programacion from '../models/Programacion.js';

// Campos del resumen del panel: sin textos ni bloques, solo contadores.
export const RESUMEN_PROJECTION = { modulo: 1, secciones: 1, exportadaEn: 1, createdAt: 1, updatedAt: 1 };

class ProgramacionDAO {
  async create(data) {
    await connectToDatabase();
    const doc = new Programacion(data);
    await doc.save();
    return doc.toObject();
  }

  async findAll() {
    await connectToDatabase();
    const docs = await Programacion.find({}, RESUMEN_PROJECTION).sort({ updatedAt: -1 }).lean();
    return docs;
  }

  async findById(id) {
    await connectToDatabase();
    const doc = await Programacion.findById(id).lean();
    return doc;
  }

  async update(id, data) {
    await connectToDatabase();
    const doc = await Programacion.findByIdAndUpdate(id, data, { 
      returnDocument: 'after', 
      runValidators: true,
      // mongoose no siempre detecta cambios profundos en campos Mixed, forzamos set:
      overwrite: false
    }).lean();
    return doc;
  }

  async delete(id) {
    await connectToDatabase();
    const doc = await Programacion.findByIdAndDelete(id).lean();
    return doc;
  }

  // Registra una exportación sin tocar updatedAt: así el panel puede saber
  // si el contenido ha cambiado después de exportar.
  async marcarExportada(id) {
    await connectToDatabase();
    await Programacion.updateOne({ _id: id }, { $set: { exportadaEn: new Date() } }, { timestamps: false });
  }
}

export const programacionDAO = new ProgramacionDAO();
