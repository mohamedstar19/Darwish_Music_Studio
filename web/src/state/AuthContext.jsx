import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());

  const loadFavorites = useCallback(async () => {
    try {
      const ids = await api.get('/api/me/favorite-ids');
      setFavoriteIds(new Set(ids));
    } catch {
      setFavoriteIds(new Set());
    }
  }, []);

  useEffect(() => {
    api
      .get('/api/auth/me')
      .then((data) => {
        setUser(data.user);
        setAllowRegistration(data.allowRegistration);
        if (data.user) loadFavorites();
      })
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, [loadFavorites]);

  const login = useCallback(
    async (email, password) => {
      const data = await api.post('/api/auth/login', { email, password });
      setUser(data.user);
      loadFavorites();
      return data.user;
    },
    [loadFavorites],
  );

  const register = useCallback(async (payload) => {
    const data = await api.post('/api/auth/register', payload);
    setUser(data.user);
    setFavoriteIds(new Set());
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
    setFavoriteIds(new Set());
  }, []);

  const toggleFavorite = useCallback(
    async (trackId) => {
      if (!user) throw new Error('سجل دخول عشان تحفظ المفضلة');
      const has = favoriteIds.has(trackId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (has) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
      try {
        if (has) await api.del(`/api/me/favorites/${trackId}`);
        else await api.put(`/api/me/favorites/${trackId}`);
      } catch (err) {
        loadFavorites();
        throw err;
      }
    },
    [user, favoriteIds, loadFavorites],
  );

  const value = useMemo(
    () => ({
      user,
      setUser,
      ready,
      allowRegistration,
      isStaff: !!user && ['editor', 'admin'].includes(user.role),
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      favoriteIds,
      toggleFavorite,
    }),
    [user, ready, allowRegistration, login, register, logout, favoriteIds, toggleFavorite],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
