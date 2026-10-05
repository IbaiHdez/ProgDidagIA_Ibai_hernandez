import { connectToDatabase } from '@/lib/mongodb';
import Programacion from '@/models/Programacion';

class ProgramacionDAO {
  async create(data) {
    await connectToDatabase();
    const doc = new Programacion(data);
    await doc.save();
    return doc.toObject();
  }

  async findAll() {
    await connectToDatabase();
    const docs = await Programacion.find({}).sort({ updatedAt: -1 }).lean();
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
}

export const programacionDAO = new ProgramacionDAO();
