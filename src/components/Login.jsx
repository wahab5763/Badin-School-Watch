import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (login(username, password)) {
      setError('');
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-slatebrand">Welcome Back</h2>
          <p className="mt-2 text-sm text-slatebrand/70">Please sign in to access the dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slatebrand">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slatebrand/20 px-4 py-3 text-slatebrand placeholder-slatebrand/50 focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
              placeholder="Enter your username"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slatebrand">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slatebrand/20 px-4 py-3 text-slatebrand placeholder-slatebrand/50 focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
              placeholder="Enter your password"
              required
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="w-full rounded-xl bg-signal px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-signal/90 focus:outline-none focus:ring-2 focus:ring-signal/20"
          >
            Sign In
          </button>
        </form>
        <div className="mt-6 text-center text-xs text-slatebrand/50">
          Secure access to Badin School Watch Dashboard
        </div>
      </div>
    </div>
  );
}