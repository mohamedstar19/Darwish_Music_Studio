import { createContext, useContext } from 'react';

// The admin panel lives under a secret path; pages build links from this base.
export const AdminBase = createContext('/admin');
export const useAdminBase = () => useContext(AdminBase);
