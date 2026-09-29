import librosa, numpy as np, json
y, sr = librosa.load("src.wav", sr=22050, mono=True)
hop=128
yh, yp = librosa.effects.hpss(y)
penv = librosa.onset.onset_strength(y=yp, sr=sr, hop_length=hop)
fr = sr/hop
def score(bpm, ph, t_end):
    T=60/bpm; g = ph + T*np.arange(0, int((t_end-ph)/T))
    idx=np.clip(np.round(g*fr).astype(int),0,len(penv)-1)
    # soft: max within +-1 frame
    v = np.maximum(np.maximum(penv[idx], penv[np.clip(idx-1,0,None)]), penv[np.clip(idx+1,0,len(penv)-1)])
    return v.mean()
for lo,hi in [(0,40),(0,150)]:
    best=None
    for bpm in np.arange(120.0, 140.0, 0.01):
        T=60/bpm
        for ph in np.arange(0, T, 0.005):
            s=score(bpm,ph,hi)
            if best is None or s>best[0]: best=(s,bpm,ph)
    print(lo,hi,best)
# librosa beats linear fit
tempo, beats = librosa.beat.beat_track(onset_envelope=penv, sr=sr, hop_length=hop, units='time', start_bpm=129)
k=np.arange(len(beats)); A=np.vstack([k,np.ones_like(k)]).T
sl, ic = np.linalg.lstsq(A, beats, rcond=None)[0]
print("fit T", sl, "bpm", 60/sl, "t0", ic, "resid std", np.std(beats-(sl*k+ic)))
res = beats-(sl*k+ic)
for i in range(0,len(beats),16): print(round(beats[i],3), round(res[i],3))
