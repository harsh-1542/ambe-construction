import { useEffect, useState, useCallback } from "react";
import { get } from "../lib/api";

/** Fetch JSON once (and on ambe:refresh events emitted after Quick Add saves). */
export function useApi<T = any>(path: string | null): { data: T | null; loading: boolean; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const onRefresh = () => setTick((t) => t + 1);
    window.addEventListener("ambe:refresh", onRefresh);
    return () => window.removeEventListener("ambe:refresh", onRefresh);
  }, []);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    get(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message || "Could not load"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  return { data, loading, error, reload };
}
