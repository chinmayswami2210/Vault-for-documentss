import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, User, Lock, KeyRound, ArrowRight } from "lucide-react";
import "./App.css";

function SignIn() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      alert("Please fill in both username and password.");
      return;
    }

    const isAdmin = username.toLowerCase() === "admin";
    const userProfile = {
      username: username.trim(),
      role: isAdmin ? "Admin" : "User",
      loginTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem("token", data.token);
        }
      }
    } catch (err) {
      console.warn("Backend auth offline, using client session fallback", err);
    }

    localStorage.setItem("user", JSON.stringify(userProfile));
    navigate("/scan");
  };

  const handleDemoFill = (roleType) => {
    if (roleType === "admin") {
      setUsername("admin");
      setPassword("admin123");
    } else {
      setUsername("inspector_sharma");
      setPassword("user123");
    }
  };

  return (
    <div className="app">
      <div className="card animate-fade-in">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "var(--primary-red)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <Shield size={26} />
          </div>
        </div>

        <h1>Sign In</h1>
        <p style={{ color: "#6b7280", fontSize: "14px", marginTop: "-12px", marginBottom: "22px" }}>
          Digital Evidence Security & Biometric Gate
        </p>

        <form onSubmit={handleLogin}>
          <div>
            <label>Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin or inspector_sharma"
              required
            />
          </div>
          <div>
            <label>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
            />
          </div>
          <div className="buttons">
            <button type="submit">
              Sign In
              <ArrowRight size={17} />
            </button>
          </div>
        </form>

        {/* Demo Roles for Quick Testing */}
        <div className="demo-row">
          <button 
            type="button" 
            className="btn-demo"
            onClick={() => handleDemoFill("admin")}
          >
            <Shield size={14} color="var(--primary-red)" />
            Demo Admin (Write)
          </button>
          <button 
            type="button" 
            className="btn-demo"
            onClick={() => handleDemoFill("user")}
          >
            <User size={14} color="#2563eb" />
            Demo User (Read)
          </button>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
