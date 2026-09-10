import React, { useState, useEffect } from 'react';
import { Key, ExternalLink, Music2, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

export function SetupView({ onConfigured }) {
  const [status, setStatus] = useState(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        if (data.redirectUri) setRedirectUri(data.redirectUri);
      })
      .catch(err => console.error('Failed to load status:', err));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Please fill in both Client ID and Client Secret');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          redirectUri: redirectUri.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save configuration');

      setSuccessMsg('Configuration saved! Ready to connect Spotify.');
      setStatus(prev => ({ ...prev, configured: true }));
      if (onConfigured) onConfigured();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-spotify-green/10 border border-spotify-green/30 text-spotify-green mb-4 shadow-lg shadow-spotify-green/10">
          <Music2 className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Spotify Jam Web
        </h1>
        <p className="text-spotify-subtext mt-2 text-sm sm:text-base max-w-md mx-auto">
          Collaborative music queue for your party. Guests can search and add songs from any phone without a Spotify account.
        </p>
      </div>

      {/* If already configured, show Connect Button */}
      {status?.configured && (
        <div className="glass-panel rounded-2xl p-6 mb-8 text-center border-spotify-green/30 shadow-xl">
          <div className="flex items-center justify-center gap-2 text-spotify-green font-semibold text-sm mb-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>Spotify API Configured</span>
          </div>
          <p className="text-xs text-spotify-subtext mb-6">
            Your host credentials are saved. Click below to authorize your Spotify Premium account and launch your room.
          </p>

          <button
            onClick={handleConnect}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-spotify-green hover:bg-spotify-green-hover text-black font-bold px-8 py-3.5 rounded-full text-base transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-spotify-green/20"
          >
            <span>Start Party (Login with Spotify)</span>
          </button>
        </div>
      )}

      {/* Setup Form Accordion / Box */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-4">
          <Key className="w-5 h-5 text-spotify-green" />
          <h2 className="text-lg font-bold text-white">
            {status?.configured ? 'Update Spotify Credentials' : 'Spotify Setup'}
          </h2>
        </div>

        {/* Quick Instructions */}
        <div className="bg-neutral-900/80 rounded-xl p-4 mb-5 border border-white/5 text-xs text-spotify-subtext space-y-2">
          <p className="font-semibold text-white">Quick 2-minute setup:</p>
          <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
            <li>
              Go to{' '}
              <a
                href="https://developer.spotify.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-spotify-green inline-flex items-center gap-0.5 underline font-medium"
              >
                Spotify Developer Dashboard <ExternalLink className="w-3 h-3" />
              </a>{' '}
              and click <strong>Create App</strong>.
            </li>
            <li>Give it any name (e.g., <em>Party Jam</em>) and select <strong>Web API</strong>.</li>
            <li>
              Under <strong>Redirect URIs</strong>, add this exact URL:
              <div className="font-mono text-[11px] bg-black/60 text-spotify-green p-1.5 rounded mt-1 select-all break-all border border-white/5">
                {redirectUri || 'http://127.0.0.1:37685/api/auth/callback'}
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">
                💡 <strong>Cloudflare Tunnel:</strong> You can add multiple Redirect URIs in Spotify! If using a tunnel or custom domain (e.g. <code>https://party.yourdomain.com</code>), also add <code>https://party.yourdomain.com/api/auth/callback</code>.
              </p>
            </li>
            <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> below.</li>
          </ol>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-spotify-subtext mb-1.5">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. 3a7f8d1c9..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-spotify-green focus:ring-1 focus:ring-spotify-green font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-spotify-subtext mb-1.5">
              Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••••••••••••••••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-spotify-green focus:ring-1 focus:ring-spotify-green font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-spotify-subtext mb-1.5">
              Redirect URI
            </label>
            <input
              type="text"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-neutral-400 text-sm focus:outline-none focus:border-spotify-green font-mono text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-neutral-200 text-black font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </form>
      </div>
    </div>
  );
}
export default SetupView;
