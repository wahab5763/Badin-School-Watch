import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDashboard, refreshDashboard } from './api';

const SNAPSHOT_KEY = 'badin-live-dashboard-snapshot';

function readSnapshot() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(payload) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {}
}

export function useDashboard() {
  const [state, setState] = useState(() => {
    const snapshot = readSnapshot();
    return { loading: !snapshot, error: null, data: snapshot };
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: !current.data, error: null }));

    fetchDashboard()
      .then((data) => {
        if (!active) return;
        writeSnapshot(data);
        setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!active) return;
        const timedOut = /timed out/i.test(String(error?.message || ''));
        setState((current) => ({
          loading: false,
          error: current.data && timedOut ? null : error.message,
          data: current.data
        }));
      });

    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setState((current) => ({ ...current, error: null }));
    try {
      const data = await refreshDashboard();
      writeSnapshot(data);
      setState({ loading: false, error: null, data });
      return data;
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error.message || 'Failed to refresh dashboard data.'
      }));
      throw error;
    } finally {
      setRefreshing(false);
    }
  }, []);

  return useMemo(() => ({ ...state, refreshing, refresh }), [state, refreshing, refresh]);
}
