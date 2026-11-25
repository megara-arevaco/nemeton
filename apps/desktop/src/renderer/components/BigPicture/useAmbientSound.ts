import { useEffect, useRef, useState } from "react";

const phrases = [
  [130.81, 196, 261.63, 329.63],
  [110, 164.81, 261.63, 293.66],
  [87.31, 130.81, 220, 329.63],
  [98, 146.83, 220, 293.66],
];

export function useAmbientSound() {
  const audio = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);

  useEffect(() => {
    if (!sound || !audio.current) {
      return;
    }

    const context = audio.current;
    const volume = context.createGain();
    volume.gain.value = document.hasFocus() ? 0.07 : 0;
    volume.connect(context.destination);
    const updateVolume = () => {
      volume.gain.setTargetAtTime(
        document.hasFocus() ? 0.07 : 0,
        context.currentTime,
        0.15,
      );
    };
    window.addEventListener("focus", updateVolume);
    window.addEventListener("blur", updateVolume);

    let phrase = 0;
    const play = () => {
      const start = context.currentTime + 0.05;

      for (const [index, frequency] of phrases[phrase].entries()) {
        const note = context.createOscillator();
        const envelope = context.createGain();
        const time = start + index * 0.35;
        note.type = index === 0 ? "sine" : "triangle";
        note.frequency.value = frequency;
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(0.22, time + 1.4);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 7);
        note.connect(envelope).connect(volume);
        note.start(time);
        note.stop(time + 7);
      }
      phrase = (phrase + 1) % phrases.length;
    };
    play();
    const timer = window.setInterval(play, 6200);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateVolume);
      window.removeEventListener("blur", updateVolume);
      volume.disconnect();
    };
  }, [sound]);

  useEffect(
    () => () => {
      void audio.current?.close();
      audio.current = null;
    },
    [],
  );

  return {
    sound,
    toggleSound: () => {
      if (sound) {
        setSound(false);
        return;
      }

      const context = (audio.current ??= new AudioContext());
      void context
        .resume()
        .then(() => {
          if (audio.current === context) {
            setSound(true);
          }
        })
        .catch(() => undefined);
    },
  };
}
