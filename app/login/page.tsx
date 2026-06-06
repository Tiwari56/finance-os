"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const [mode, setMode] = useState<"login" | "register">("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        if (mode === "register") {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error); setLoading(false); return; }
        }

        const result = await signIn("credentials", {
            email,
            password,
            redirect: false,
        });

        if (result?.error) {
            setError("Invalid email or password");
            setLoading(false);
        } else {
            router.push("/");
            router.refresh();
        }
    }

    async function handleOAuth(provider: "google" | "github") {
        await signIn(provider, { callbackUrl: "/" });
    }

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="text-4xl mb-2">💰</div>
                    <h1 className="text-xl font-bold text-white">Finance OS</h1>
                    <p className="text-sm text-zinc-500 mt-1">Your personal finance command center</p>
                </div>

                {/* Card */}
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-xl">
                    {/* Tabs */}
                    <div className="flex rounded-xl bg-black/30 p-1 mb-6">
                        {(["login", "register"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => { setMode(m); setError(""); }}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === m
                                        ? "bg-white/10 text-white"
                                        : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                            >
                                {m === "login" ? "Sign in" : "Create account"}
                            </button>
                        ))}
                    </div>

                    {/* OAuth buttons */}
                    <div className="space-y-2 mb-4">
                        <button
                            onClick={() => handleOAuth("google")}
                            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-zinc-200 transition-all"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                            Continue with Google
                        </button>
                        <button
                            onClick={() => handleOAuth("github")}
                            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-zinc-200 transition-all"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
                            Continue with GitHub
                        </button>
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-zinc-500">or</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {/* Email form */}
                    <form onSubmit={handleSubmit} className="space-y-3">
                        {mode === "register" && (
                            <input
                                type="text"
                                placeholder="Your name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                className="w-full bg-black/30 text-white rounded-xl px-4 py-2.5 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-zinc-600"
                            />
                        )}
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className="w-full bg-black/30 text-white rounded-xl px-4 py-2.5 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-zinc-600"
                        />
                        <input
                            type="password"
                            placeholder="Password (min 8 chars)"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            className="w-full bg-black/30 text-white rounded-xl px-4 py-2.5 text-sm border border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder-zinc-600"
                        />
                        {error && (
                            <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition-all"
                        >
                            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
                        </button>
                    </form>
                </div>

                <p className="text-center text-xs text-zinc-600 mt-6">
                    Your financial data is private and only visible to you.
                </p>
            </div>
        </div>
    );
}
