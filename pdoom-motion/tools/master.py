# Gentle master of the 20 s window + subtle impact sound design synced to the visuals.
import numpy as np, soundfile as sf
from scipy import signal
START, DUR = 16.571, 20.0
x, sr = sf.read("src.wav", start=int(START*48000), frames=int(DUR*48000), dtype='float64')
n = len(x); t = np.arange(n)/sr

def biquad_shelf(f0, gain_db, kind, q=0.707):
    A = 10**(gain_db/40); w0 = 2*np.pi*f0/sr; al = np.sin(w0)/(2*q); c = np.cos(w0)
    if kind == 'low':
        b = [A*((A+1)-(A-1)*c+2*np.sqrt(A)*al), 2*A*((A-1)-(A+1)*c), A*((A+1)-(A-1)*c-2*np.sqrt(A)*al)]
        a = [(A+1)+(A-1)*c+2*np.sqrt(A)*al, -2*((A-1)+(A+1)*c), (A+1)+(A-1)*c-2*np.sqrt(A)*al]
    else:
        b = [A*((A+1)+(A-1)*c+2*np.sqrt(A)*al), -2*A*((A-1)+(A+1)*c), A*((A+1)+(A-1)*c-2*np.sqrt(A)*al)]
        a = [(A+1)-(A-1)*c+2*np.sqrt(A)*al, 2*((A-1)-(A+1)*c), (A+1)-(A-1)*c-2*np.sqrt(A)*al]
    return np.array(b)/a[0], np.array(a)/a[0]

y = x.copy()
for f0, g, k in [(65, 1.2, 'low'), (10000, 1.8, 'high')]:
    b, a = biquad_shelf(f0, g, k); y = signal.lfilter(b, a, y, axis=0)
# subtle width: side +8%
M = (y[:,0]+y[:,1])/2; Sd = (y[:,0]-y[:,1])/2*1.08; y = np.stack([M+Sd, M-Sd], 1)

# --- sound design: sub impacts + reverse swell into FOOM ---
def sub_boom(at, gain, f0=62, f1=32, dec=0.55):
    i0 = int(at*sr); L = int(1.6*sr); tt = np.arange(L)/sr
    f = f1 + (f0-f1)*np.exp(-tt/0.12); ph = 2*np.pi*np.cumsum(f)/sr
    s = np.sin(ph)*np.exp(-tt/dec)*(1-np.exp(-tt/0.004))
    e = min(n, i0+L); y[i0:e] += (gain*s[:e-i0])[:,None]
def swell(a, b, gain):
    i0, i1 = int(a*sr), int(b*sr); L = i1-i0
    rng = np.random.default_rng(7); nz = rng.standard_normal((L, 2))
    sos = signal.butter(2, [1500, 9000], 'bandpass', fs=sr, output='sos'); nz = signal.sosfilt(sos, nz, axis=0)
    env = (np.linspace(0, 1, L)**3); y[i0:i1] += gain*nz*env[:,None]
sub_boom(7.32, 0.16); sub_boom(9.37, 0.2, dec=0.7); sub_boom(18.69, 0.16, dec=0.8); sub_boom(14.94, 0.1)
swell(8.75, 9.37, 0.035); swell(6.0, 6.43, 0.02)

# --- ending: low-pass sweep + fade as the eye closes ---
sos = signal.butter(4, 700, 'low', fs=sr, output='sos'); lp = signal.sosfiltfilt(sos, y, axis=0)
k = np.clip((t-19.35)/0.5, 0, 1)[:,None]; y = y*(1-k) + lp*k
fade = np.clip((20.0 - t)/0.55, 0, 1)**1.6; y *= fade[:,None]
y[:int(0.004*sr)] *= np.linspace(0, 1, int(0.004*sr))[:,None]

# --- loudness: +3.3 dB then lookahead peak limiter at -1.2 dBFS (4x oversampled detection) ---
y *= 10**(3.3/20)
ceil = 10**(-1.2/20)
up = signal.resample_poly(y, 4, 1, axis=0); pk = np.abs(up).max(1).reshape(-1, 4).max(1)[:n]
look = int(0.003*sr); rel = np.exp(-1/(0.08*sr))
need = np.minimum(1, ceil/np.maximum(pk, 1e-9))
need = np.minimum.accumulate(np.lib.stride_tricks.sliding_window_view(np.pad(need, (0, look), constant_values=1), look+1).min(1)[None,:], axis=0)[0]
g = np.empty(n); cur = 1.0
for i in range(n):
    cur = need[i] if need[i] < cur else need[i] + (cur-need[i])*rel
    g[i] = cur
y *= g[:,None]
sf.write("master.wav", y.astype(np.float32), sr, subtype='PCM_24')
print("peak", 20*np.log10(np.abs(y).max()), "min gain dB", 20*np.log10(g.min()))
