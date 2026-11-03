// Screen-space effects drawn with plain DOM + CSS animations:
// hearts and sparkles at the finger, sound words, sleepy Zs and toasts.
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C13 7 17 11 24 12 17 13 13 17 12 24 11 17 7 13 0 12 7 11 11 7 12 0z"/></svg>';
const MAX_NODES = 70;

export class Fx {
  constructor(layer, toastEl) {
    this.layer = layer;
    this.toastEl = toastEl;
    this.toastTimer = 0;
  }

  _spawn(cls, html, x, y, size, vars) {
    if (this.layer.childElementCount > MAX_NODES) return null;
    const el = document.createElement('span');
    el.className = cls;
    el.innerHTML = html;
    el.style.setProperty('--x', `${x - size / 2}px`);
    el.style.setProperty('--y', `${y - size / 2}px`);
    el.style.setProperty('--s', `${size}px`);
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    this.layer.appendChild(el);
    return el;
  }

  burst(x, y, kind = 'heart', n = 1) {
    for (let i = 0; i < n; i++) {
      const heart = kind === 'heart';
      const size = heart ? 16 + Math.random() * 14 : 10 + Math.random() * 12;
      this._spawn(heart ? 'fx-heart' : 'fx-spark', heart ? HEART : SPARK, x, y, size, {
        '--dx': `${(Math.random() - 0.5) * 100}px`,
        '--dy': `${70 + Math.random() * 90}px`,
        '--r': `${(Math.random() - 0.5) * 60}deg`,
        '--d': `${900 + Math.random() * 500}ms`,
        '--delay': `${i * 70}ms`,
        '--c': heart ? `var(--heart-${1 + Math.floor(Math.random() * 3)})` : 'var(--spark)',
      });
    }
  }

  word(x, y, text) {
    const el = this._spawn('fx-word', '', x, y, 0, {
      '--dx': `${(Math.random() - 0.5) * 30}px`,
      '--dy': '46px',
      '--r': `${(Math.random() - 0.5) * 16}deg`,
      '--d': '900ms',
      '--delay': '0ms',
    });
    if (el) el.textContent = text;
  }

  zzz(x, y) {
    const el = this._spawn('fx-zzz', '', x, y, 0, {
      '--dx': `${18 + Math.random() * 18}px`,
      '--dy': `${40 + Math.random() * 20}px`,
      '--r': `${-10 + Math.random() * 20}deg`,
      '--d': '2200ms',
      '--delay': '0ms',
      '--fs': `${14 + Math.random() * 8}px`,
    });
    if (el) el.textContent = 'Z';
  }

  toast(message, ms = 2400) {
    const el = this.toastEl;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
}
