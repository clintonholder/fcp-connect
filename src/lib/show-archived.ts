import { useEffect, useState } from "react";

const KEY = "fcp:show-archived";
const listeners = new Set<(v: boolean) => void>();

function read() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

/** Shared "Show archived" toggle state, kept in sync across the Projects and Map views. */
export function useShowArchived(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(false);

  useEffect(() => {
    setValue(read());
    const fn = (v: boolean) => setValue(v);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const set = (v: boolean) => {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, v ? "1" : "0");
    listeners.forEach((fn) => fn(v));
  };

  return [value, set];
}
