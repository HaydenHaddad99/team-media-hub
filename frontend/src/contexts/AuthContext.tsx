import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthContextType {
  token: string | null;
  teamId: string | null;
  setToken: (token: string, teamId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [teamId, setTeamIdState] = useState<string | null>(null);

  useEffect(() => {
    // Load from localStorage
    const savedToken = localStorage.getItem('invite_token');
    const savedTeamId = localStorage.getItem('team_id');
    if (savedToken && savedTeamId) {
      setTokenState(savedToken);
      setTeamIdState(savedTeamId);
    }

    // Check URL for token
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('invite_token', urlToken);
      setTokenState(urlToken);
      // We'll get teamId from the first API call
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const setToken = (newToken: string, newTeamId: string) => {
    localStorage.setItem('invite_token', newToken);
    localStorage.setItem('team_id', newTeamId);
    setTokenState(newToken);
    setTeamIdState(newTeamId);
  };

  const logout = () => {
    localStorage.removeItem('invite_token');
    localStorage.removeItem('team_id');
    setTokenState(null);
    setTeamIdState(null);
  };

  return (
    <AuthContext.Provider value={{ token, teamId, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
