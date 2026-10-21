/**
 * B-099: «Rå lyd (uten støydemping og automatisk nivå)». På datamaskinen huskes valget på kontoen
 * (profiles.ui_prefs); på mobilsiden (uten innlogging) i telefonens nettleser. Standard: på.
 */
import { useCallback, useEffect, useState } from "react";
import { RAW_AUDIO_DEFAULT } from "@/core";
import { useUiPref } from "@/app/account/ui-prefs";

export const RAW_AUDIO_PREF = "audio.rawRecording"; // i18n-ignore: nøkkel
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Valget på kontoen (datamaskinen). */
export function useRawAudioPref(): [boolean, (v: boolean) => void] {
  return useUiPref<boolean>(RAW_AUDIO_PREF, RAW_AUDIO_DEFAULT, isBool);
}

const DEVICE_KEY = "animatic:mobile:rawAudio"; // i18n-ignore: nøkkel

/** Valget på telefonen (mobilsiden har ingen konto). */
export function useDeviceRawAudioPref(): [boolean, (v: boolean) => void] {
  const [raw, setRaw] = useState(RAW_AUDIO_DEFAULT);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(DEVICE_KEY);
      if (v === "true" || v === "false") setRaw(v === "true");
    } catch {
      /* privat vindu */
    }
  }, []);
  const set = useCallback((v: boolean) => {
    setRaw(v);
    try {
      window.localStorage.setItem(DEVICE_KEY, String(v));
    } catch {
      /* privat vindu */
    }
  }, []);
  return [raw, set];
}
