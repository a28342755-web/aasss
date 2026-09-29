import { pipeline, env } from '@huggingface/transformers';
import fs from 'fs';
env.allowRemoteModels = false; env.localModelPath = new URL('./models/', import.meta.url).pathname;
const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', { dtype: 'q8' });
const out = {};
for (const f of process.argv.slice(2)) {
  const off = parseFloat(f.match(/_([\d.]+)\.f32$/)[1]);
  const buf = fs.readFileSync(f); const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength/4);
  const r = await asr(audio, { return_timestamps: 'word', language: 'english', task: 'transcribe' });
  out[f] = r.chunks.map(c => [c.text.trim(), +(c.timestamp[0] + off).toFixed(2)]);
  console.log(f.slice(0,5), off, out[f].map(([w,t])=>`${w}@${t.toFixed(2)}`).join(' '));
}
fs.writeFileSync('asr_crops.json', JSON.stringify(out));
