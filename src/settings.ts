export interface Settings {
  apiKey: string;
  model: string;
}

export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5（默认，拆解质量最好）" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5（更便宜）" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5（最快最便宜）" },
] as const;

export const DEFAULT_SETTINGS: Settings = { apiKey: "", model: "claude-opus-5" };

const KEY = "stepkeep.settings";
const hasChromeStorage = () => typeof chrome !== "undefined" && !!chrome.storage?.local;

// 扩展内用 chrome.storage.local；用 vite dev 在普通网页里调试时退回 localStorage
export async function loadSettings(): Promise<Settings> {
  if (hasChromeStorage()) {
    const r = await chrome.storage.local.get(KEY);
    return { ...DEFAULT_SETTINGS, ...(r[KEY] as Partial<Settings> | undefined) };
  }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings) {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [KEY]: s });
  } else {
    localStorage.setItem(KEY, JSON.stringify(s));
  }
}
