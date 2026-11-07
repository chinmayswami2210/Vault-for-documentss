import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Shield } from 'lucide-react';

const Login = () => {
    const { login } = useContext(AuthContext);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const result = await login(username, password);
        if (!result.success) {
            setError(result.message);
        }
    };

    // Helper for demo purposes
    const fillCredentials = (role) => {
        if (role === 'admin') {
            setUsername('admin');
            setPassword('admin123');
        } else {
            setUsername('inspector_sharma');
            setPassword('user123');
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <Shield size={56} className="seal-icon" />
                <div className="text-center" style={{ marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>TRACE VAULT</h1>
                    <p className="text-muted" style={{ fontSize: '0.875rem' }}>Department of Digital Evidence Security</p>
                </div>

                {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', border: '1px solid var(--danger)', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">Secure Identifier ID</label>
                        <input
                            type="text"
                            className="form-control"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '2rem' }}>
                        <label className="form-label">Access Passcode</label>
                        <input
                            type="password"
                            className="form-control"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="btn">
                        <Shield size={18} />
                        Authenticate Session
                    </button>
                </form>

                <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.5rem', fontSize: '0.75rem' }} onClick={() => fillCredentials('admin')}>
                        Demo Admin
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.5rem', fontSize: '0.75rem' }} onClick={() => fillCredentials('user')}>
                        Demo User
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
