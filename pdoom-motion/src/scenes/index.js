// Full-song scene list. The original 20 s chorus (A–H) runs on its own clock, offset to song time.
import A from './a_chat.js';
import B from './b_eat.js';
import Cc from './c_doom.js';
import D from './d_foom.js';
import Ee from './e_room.js';
import F from './f_shrooms.js';
import G from './g_lies.js';
import Hh from './h_eyes.js';
import V1 from './n1_verse1.js';
import V2 from './n2_verse2.js';
import C2 from './n3_chorus2.js';
import V3 from './n4_verse3.js';
import C3 from './n5_chorus3.js';
import SC from './n6_scale.js';
import C4 from './n7_chorus4.js';
import FIN from './n8_finale.js';

export const CHORUS1_OFF = 16.571;
const chorus1 = [A, B, Cc, D, Ee, F, G, Hh];
for (const s of chorus1) s.off = CHORUS1_OFF;

export const SCENES = [...V1, ...chorus1, ...V2, ...C2, ...V3, ...C3, ...SC, ...C4, ...FIN];

// full edit: the closing cursor of the chorus is handed to the next scene; chorus cut: it fades out at 20 s
export function scenesFor(full) {
  Hh.end = full ? 19.9 : 20.01;
  return full ? SCENES : chorus1;
}
