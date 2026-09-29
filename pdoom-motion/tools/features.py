import librosa, numpy as np, json, sys
START=float(sys.argv[1]); DUR=float(sys.argv[2]); FPS=int(sys.argv[3]) if len(sys.argv)>3 else 60
sr=44100
y, _ = librosa.load("src.wav", sr=sr, mono=True, offset=max(0,START-1), duration=DUR+2)
pad = START-max(0,START-1)
hop = sr//FPS  # 735 @60
n_frames = int(round(DUR*FPS))
S = np.abs(librosa.stft(y, n_fft=4096, hop_length=hop, center=True))**2
freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
ft = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop) - pad
def band(lo,hi):
    m=(freqs>=lo)&(freqs<hi); return S[m].sum(0)
def norm(x, p=99):
    x = np.log1p(x/ (np.percentile(x,50)+1e-9)); return x/ (np.percentile(x,p)+1e-9)
# 48 log bands 40Hz-16k
edges = np.geomspace(40,16000,49)
bands = np.stack([band(edges[i],edges[i+1]) for i in range(48)])
bands = np.log10(bands+1e-10); bands = (bands - np.percentile(bands,5,axis=1,keepdims=True)); bands = bands/ (np.percentile(bands,99)+1e-9)
bands = np.clip(bands,0,1)
kick = band(35,130); snare = band(1500,5000); hat = band(7000,16000); rms = S.sum(0)
onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
def env(x, attack=1.0, release=0.85):
    out=np.zeros_like(x); v=0
    for i,xx in enumerate(x):
        v = xx if xx>v else v*release + xx*(1-release)
        out[i]=v
    return out
# transient envelopes: positive derivative of log energy
def trans(x):
    lx=np.log(x+1e-9); d=np.maximum(0,np.diff(lx,prepend=lx[0])); d=d/(np.percentile(d,99.5)+1e-9); return np.clip(env(np.clip(d,0,1.5),release=0.82),0,1.5)
feat = {}
idx = np.array([np.argmin(np.abs(ft - i/FPS)) for i in range(n_frames)])
feat['fps']=FPS; feat['start']=START; feat['n']=n_frames
feat['rms']=np.round(np.clip(norm(rms)[idx],0,1.5),3).tolist()
feat['kick']=np.round(trans(kick)[idx],3).tolist()
feat['snare']=np.round(trans(snare)[idx],3).tolist()
feat['hat']=np.round(trans(hat)[idx],3).tolist()
feat['onset']=np.round(np.clip(onset/np.percentile(onset,99.5),0,1.5)[np.clip(idx,0,len(onset)-1)],3).tolist()
feat['bands']=np.round(bands[:,idx].T,3).tolist()
json.dump(feat, open(f"features.json","w"))
print("frames", n_frames)
