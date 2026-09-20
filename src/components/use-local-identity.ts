"use client";

import { useSyncExternalStore } from "react";
import { isPrivateKey } from "@/lib/keys";

// The member's private identity key, held only in this browser's localStorage.
// Read through useSyncExternalStore so server render (no key) and client render
// stay consistent, and same-tab writes re-render via a custom event.

export const IDENTITY_STORE = "fw_identity";
const CHANGE = "fw_identity_change";

function read(): string | null {
  try {
    const v = localStorage.getItem(IDENTITY_STORE);
    return v && isPrivateKey(v) ? v.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE, cb);
  };
}

export function useLocalIdentity(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function setLocalIdentity(privateKey: string | null) {
  if (privateKey) localStorage.setItem(IDENTITY_STORE, privateKey);
  else localStorage.removeItem(IDENTITY_STORE);
  window.dispatchEvent(new Event(CHANGE));
}
