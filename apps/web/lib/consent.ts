export const CONSENT_STORAGE_KEY = "buskativa:consent";
export const CONSENT_EVENT = "buskativa:consent";
export type ConsentChoice = "granted" | "denied";

export interface ConsentState {
  ad_storage: ConsentChoice;
  ad_user_data: ConsentChoice;
  ad_personalization: ConsentChoice;
  analytics_storage: ConsentChoice;
}

/** Google Consent Mode v2: tudo negado até o usuário aceitar. */
export const CONSENT_DEFAULTS: ConsentState = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
};

export function consentState(choice: ConsentChoice): ConsentState {
  return { ad_storage: choice, ad_user_data: choice, ad_personalization: choice, analytics_storage: choice };
}

export function parseConsent(raw: string | null | undefined): ConsentChoice | null {
  return raw === "granted" || raw === "denied" ? raw : null;
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Lê a escolha salva; qualquer falha de storage vira "sem escolha". */
export function readConsent(storage: Pick<Storage, "getItem"> | undefined = safeLocalStorage()): ConsentChoice | null {
  try {
    return parseConsent(storage?.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveConsent(choice: ConsentChoice, storage: Pick<Storage, "setItem"> | undefined = safeLocalStorage()): void {
  try {
    storage?.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // storage bloqueado: a escolha vale só nesta página
  }
}
