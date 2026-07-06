import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // SHA-256 password hash for passcode: "ReservingHub2026!"
  const SECURE_HASH = "f658574902ee771238e8f95a8ac88200f9cc9007ddb05a9a74bd207dde1a85af";

  const sha256PureJS = (ascii: string): string => {
    const rightRotate = (value: number, amount: number) => {
      return (value >>> amount) | (value << (32 - amount));
    };
    
    const result: string[] = [];
    const words: number[] = [];
    const asciiLength = ascii.length;
    
    const hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];

    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    let w: number[] = [];
    let wordsLength = ((asciiLength + 8) >> 6) + 1;
    for (let i = 0; i < wordsLength * 16; i++) words[i] = 0;
    for (let i = 0; i < asciiLength; i++) {
      words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
    }
    words[asciiLength >> 2] |= 0x80 << (24 - (asciiLength % 4) * 8);
    words[wordsLength * 16 - 1] = asciiLength * 8;

    for (let j = 0; j < wordsLength; j++) {
      w = [];
      let a = hash[0], b = hash[1], c = hash[2], d = hash[3],
          e = hash[4], f = hash[5], g = hash[6], h = hash[7];

      for (let i = 0; i < 64; i++) {
        if (i < 16) {
          w[i] = words[j * 16 + i];
        } else {
          const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
          const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }

        const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
        const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) | 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) | 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) | 0;
      }

      hash[0] = (hash[0] + a) | 0;
      hash[1] = (hash[1] + b) | 0;
      hash[2] = (hash[2] + c) | 0;
      hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0;
      hash[5] = (hash[5] + f) | 0;
      hash[6] = (hash[6] + g) | 0;
      hash[7] = (hash[7] + h) | 0;
    }

    for (let i = 0; i < 8; i++) {
      const hex = (hash[i] >>> 0).toString(16).padStart(8, '0');
      result.push(hex);
    }

    return result.join('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setError(false);

    try {
      const hashedAttempt = sha256PureJS(password);
      if (hashedAttempt === SECURE_HASH) {
        sessionStorage.setItem('reserving-analytics-auth', 'true');
        onSuccess();
      } else {
        setError(true);
        setPassword('');
      }
    } catch (err) {
      console.error("Authentication failed:", err);
      setError(true);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div 
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-ambient)',
        padding: '24px'
      }}
    >
      <div 
        className="card card-glass" 
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)',
          borderRadius: 'var(--radius-lg)',
          animation: 'fadeIn var(--transition-normal) ease-out'
        }}
      >
        {/* Header App Icon */}
        <div 
          style={{
            width: '56px',
            height: '56px',
            margin: '0 auto 20px',
            backgroundColor: 'var(--bg-surface-elevated)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
          }}
        >
          <svg viewBox="0 0 32 32" style={{ width: '38px', height: '38px' }}>
            <defs>
              <linearGradient id="loginStairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
            </defs>
            <path d="M4,26 L26,26 L26,20 L18,20 L18,12 L10,12 L10,4 L4,4 Z" fill="url(#loginStairGrad)" />
            <circle cx="7" cy="8" r="1.6" fill="#ffffff" opacity="0.95" />
            <circle cx="14" cy="16" r="1.6" fill="#ffffff" opacity="0.95" />
          </svg>
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '6px' }}>
          Reserving Analytics Hub
        </h2>
        <p style={{ fontSize: '0.825rem', color: 'var(--color-muted)', marginBottom: '32px' }}>
          Actuarial Reserving Workspace Gatekeeper
        </p>

        {error && (
          <div 
            className="alert alert-error" 
            style={{ 
              marginBottom: '20px', 
              padding: '10px 12px', 
              fontSize: '0.775rem', 
              textAlign: 'left',
              animation: 'fadeIn var(--transition-fast) ease-out'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>Invalid Security Key. Please verify the passcode.</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ textAlign: 'left' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-secondary)', marginBottom: '8px' }}>
              Enter Workspace Passcode
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock 
                size={16} 
                style={{ 
                  position: 'absolute', 
                  left: '12px', 
                  color: 'var(--color-muted)' 
                }} 
              />
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="Passcode..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 40px 10px 36px',
                  fontSize: '0.9rem',
                  borderRadius: '8px',
                  border: error ? '1.5px solid var(--status-error)' : '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--color-primary)',
                  transition: 'all var(--transition-fast)'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isAuthenticating}
            style={{
              width: '100%',
              padding: '12px',
              fontWeight: 600,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              marginTop: '8px'
            }}
          >
            {isAuthenticating ? 'Unlocking...' : 'Unlock Workspace'}
          </button>
        </form>

        <div style={{ marginTop: '36px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <span style={{ fontSize: '0.725rem', color: 'var(--color-muted)' }}>
            System Status: <strong>STAGING DEMO LOCK v1.1.2</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
