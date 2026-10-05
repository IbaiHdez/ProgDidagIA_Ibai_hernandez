import { readFileSync } from 'node:fs';
import { GoogleGenAI, Type } from '@google/genai';
const env = readFileSync('./.env.local','utf8');
const ekey = env.match(/^GEMINI_API_KEY=(.*)$/m)[1].trim();
const ai = new GoogleGenAI({ apiKey: ekey });

const schema = {
  type: Type.OBJECT,
  properties: {
    modulo: { type: Type.OBJECT, properties: { codigo:{type:Type.STRING}, nombre:{type:Type.STRING}, curso:{type:Type.STRING}, profesor:{type:Type.STRING} }, required:['codigo','nombre','curso','profesor'] },
    secciones: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      codigo:{type:Type.STRING}, titulo:{type:Type.STRING}, nivel:{type:Type.INTEGER}, orden:{type:Type.INTEGER},
      bloques:{ type:Type.ARRAY, items:{ type:Type.OBJECT, properties:{
        tipo:{type:Type.STRING, enum:['texto','lista','tabla']}, texto:{type:Type.STRING},
        items:{type:Type.ARRAY, items:{type:Type.STRING}},
        columnas:{type:Type.ARRAY, items:{type:Type.STRING}},
        filas:{type:Type.ARRAY, items:{type:Type.ARRAY, items:{type:Type.STRING}}}
      }, required:['tipo'] } }
    }, required:['codigo','titulo','nivel','orden','bloques'] } }
  },
  required: ['modulo','secciones'],
};

const prompt = 'Analiza:\n10.2 Desarrollo Web en Entorno Servidor\n10.2.1 Introducción\nResultados de aprendizaje: RA1 conoce, RA2 aplica';

for (const m of ['gemini-3.8-flash','gemini-3.7-flash','gemini-3.5-flash','gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.5-pro']) {
  const t0 = Date.now();
  try {
    const r = await ai.models.generateContent({ model:m, contents: prompt,
      config: { systemInstruction:'Eres experto. Responde solo JSON.', responseMimeType:'application/json', responseSchema:schema, maxOutputTokens:65536 } });
    let v='-';
    try { const p=JSON.parse(r.text); v=`JSON OK, secciones=${p.secciones?.length}, bloques0=${p.secciones?.[0]?.bloques?.length}`; } catch { v='JSON INVALIDO: '+r.text.slice(0,80); }
    console.log(`${m}: OK ${Date.now()-t0}ms ${v} finish=${r.candidates?.[0]?.finishReason}`);
  } catch(e) {
    console.log(`${m}: ERROR ${Date.now()-t0}ms ${(e.message||'').slice(0,140)}`);
  }
}
