import librosa, numpy as np, soundfile as sf
y, sr = librosa.load("src.wav", sr=22050, mono=False)
mid = (y[0]+y[1])/2
S_full, phase = librosa.magphase(librosa.stft(mid, n_fft=2048, hop_length=512))
S_filter = librosa.decompose.nn_filter(S_full, aggregate=np.median, metric='cosine', width=int(librosa.time_to_frames(2, sr=sr)))
S_filter = np.minimum(S_full, S_filter)
mask_v = librosa.util.softmask(S_full - S_filter, 8 * S_filter, power=2)
yv = librosa.istft(mask_v*S_full*phase, hop_length=512, length=len(mid))
sf.write("vocals_full.wav", yv, sr)
print("ok", len(yv)/sr)
