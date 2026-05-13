import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('authenticated');
    if (auth === 'true') {
      setIsAuthenticated(true);
    } else {
      setShowLogin(true);
    }
  }, []);

  const login = (username, password) => {
    if (username === 'admin' && password === 'admin786') {
      setIsAuthenticated(true);
      setShowLogin(false);
      localStorage.setItem('authenticated', 'true');
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    setShowLogin(true);
    localStorage.removeItem('authenticated');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, showLogin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}