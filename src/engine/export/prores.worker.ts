/** P7: ProRes encoding off the main thread (one frame per message, buffers transferred). */
import { encodeProResFrame, type ProResProfile } from "./prores";

interface Job { id: number; width: number; height: number; profile: ProResProfile; rgba: Uint8ClampedArray }
const scope = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage(m: unknown, t?: Transferable[]): void };
scope.onmessage = (e) => {
  const { id, width, height, profile, rgba } = e.data;
  try {
    const frame = encodeProResFrame({ width, height, profile, rgba });
    scope.postMessage({ id, frame }, [frame.buffer]);
  } catch (err) {
    scope.postMessage({ id, error: (err as Error).message });
  }
};
