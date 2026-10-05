import mongoose from 'mongoose';

const ProgramacionSchema = new mongoose.Schema({
  modulo: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true 
  },
  secciones: { 
    type: [mongoose.Schema.Types.Mixed], 
    default: [] 
  }
}, { 
  timestamps: true,
  // Para asegurar que los datos mixtos no pierden estructura o tipos
  strict: false 
});

// Evitar recompilar el modelo durante Fast Refresh de Next.js
export default mongoose.models.Programacion || mongoose.model('Programacion', ProgramacionSchema);
