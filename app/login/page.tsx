"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/lib/ui/icons";

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

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
            <div className="w-full max-w-sm slide-up">
                {/* Logo */}
                <div className="flex flex-col items-center text-center mb-8">
                    <div className="mb-4"><LogoMark size={56} /></div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">Steady</h1>
                    <p className="text-sm text-zinc-500 mt-1.5">Stay on top of your money.</p>
                </div>

                {/* Card */}
                <div className="surface-elev p-6">
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
                            className="btn-primary w-full !py-3"
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
