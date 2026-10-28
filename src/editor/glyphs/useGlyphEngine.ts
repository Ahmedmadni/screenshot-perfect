/** React bindings for the glyph engine (re-render when fonts finish loading). */
import { useSyncExternalStore } from "react";
import { glyphEngine, type EngineStatus } from "./engine";

const serverVersion = () => 0;

export function useGlyphEngineVersion(): number {
  return useSyncExternalStore(glyphEngine.subscribe, glyphEngine.getVersion, serverVersion);
}

export function useEngineStatus(family: string, weight: number): EngineStatus {
  useGlyphEngineVersion();
  return glyphEngine.status(family, weight);
}
