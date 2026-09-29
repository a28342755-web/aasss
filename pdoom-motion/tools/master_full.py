# Full-song master: gentle EQ + width, subtle sub impacts on the video's biggest hits, transparent limiter.
import numpy as np, soundfile as sf
from scipy import signal
x, sr = sf.read("src.wav", dtype='float64'); n = len(x); t = np.arange(n)/sr
def shelf(f0, g, kind, q=0.707):
    A = 10**(g/40); w0 = 2*np.pi*f0/sr; al = np.sin(w0)/(2*q); c = np.cos(w0)
    if kind == 'low':
        b = [A*((A+1)-(A-1)*c+2*np.sqrt(A)*al), 2*A*((A-1)-(A+1)*c), A*((A+1)-(A-1)*c-2*np.sqrt(A)*al)]
        a = [(A+1)+(A-1)*c+2*np.sqrt(A)*al, -2*((A-1)+(A+1)*c), (A+1)+(A-1)*c-2*np.sqrt(A)*al]
    else:
        b = [A*((A+1)+(A-1)*c+2*np.sqrt(A)*al), -2*A*((A-1)+(A+1)*c), A*((A+1)+(A-1)*c-2*np.sqrt(A)*al)]
        a = [(A+1)-(A-1)*c+2*np.sqrt(A)*al, 2*((A-1)-(A+1)*c), (A+1)-(A-1)*c-2*np.sqrt(A)*al]
    return np.array(b)/a[0], np.array(a)/a[0]
y = x.copy()
for f0, g, k in [(65, 1.2, 'low'), (10000, 1.8, 'high')]:
    b, a = shelf(f0, g, k); y = signal.lfilter(b, a, y, axis=0)
M = (y[:,0]+y[:,1])/2; Sd = (y[:,0]-y[:,1])/2*1.08; y = np.stack([M+Sd, M-Sd], 1)
def boom(at, gain, f0=62, f1=32, dec=0.6):
    i0 = int(at*sr); L = int(1.6*sr); tt = np.arange(L)/sr
    f = f1 + (f0-f1)*np.exp(-tt/0.12); ph = 2*np.pi*np.cumsum(f)/sr
    s = np.sin(ph)*np.exp(-tt/dec)*(1-np.exp(-tt/0.004)); e = min(n, i0+L); y[i0:e] += (gain*s[:e-i0])[:,None]
for at, g in [(23.894, 0.14), (25.94, 0.17), (60.258, 0.14), (62.303, 0.15), (110.485, 0.2), (140.258, 0.18), (151.167, 0.16)]:
    boom(at, g)
y *= 10**(2.6/20)
ceil = 10**(-1.2/20)
up = signal.resample_poly(y, 4, 1, axis=0); pk = np.abs(up).max(1).reshape(-1, 4).max(1)[:n]
look = int(0.003*sr); rel = np.exp(-1/(0.08*sr))
need = np.minimum(1, ceil/np.maximum(pk, 1e-9))
need = np.lib.stride_tricks.sliding_window_view(np.pad(need, (0, look), constant_values=1), look+1).min(1)
g = np.empty(n); cur = 1.0
for i in range(n):
    cur = need[i] if need[i] < cur else need[i] + (cur-need[i])*rel
    g[i] = cur
y *= g[:,None]
fade = np.clip((t[-1] - t)/0.3, 0, 1); y *= fade[:,None]
sf.write("master_full.wav", y.astype(np.float32), sr, subtype='PCM_24')
print("dur", n/sr, "peak", 20*np.log10(np.abs(y).max()), "min gain dB", 20*np.log10(g.min()), "limiting>1dB frac", np.mean(g < 10**(-1/20)))
