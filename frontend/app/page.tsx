"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type AppState = "landing" | "config" | "running";

interface RunResult {
  run_id: string;
  team_name: string;
  wandb_url: string;
  runs_used: number;
  runs_remaining: number;
}

export default function Home() {
  const [state, setState] = useState<AppState>("landing");
  const [teamName, setTeamName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [numEnvs, setNumEnvs] = useState(1024);
  const [maxIter, setMaxIter] = useState(1000);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [runsRemaining, setRunsRemaining] = useState<number | null>(null);
  const [runsMax, setRunsMax] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch runs remaining when team_name changes (debounced)
  const fetchRuns = useCallback((name: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (name.length < 3) {
      setRunsRemaining(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/runs/${encodeURIComponent(name)}`);
        if (res.ok) {
          const data = await res.json();
          setRunsRemaining(data.runs_remaining);
          setRunsMax(data.max_runs);
        }
      } catch {
        // silently ignore
      }
    }, 500);
  }, []);

  useEffect(() => {
    fetchRuns(teamName);
  }, [teamName, fetchRuns]);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_name: teamName,
          wandb_api_key: apiKey,
          num_envs: numEnvs,
          max_iterations: maxIter,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Request failed (${res.status})`);
      }
      const data: RunResult = await res.json();
      setResult(data);
      setRunsRemaining(data.runs_remaining);
      setState("running");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit =
    teamName.trim() !== "" &&
    apiKey.trim() !== "" &&
    !loading;

  const poweredBy = (
    <div className="fixed bottom-4 right-4 flex flex-col items-center opacity-80">
      <span className="text-sm text-zinc-400">Powered by</span>
      <a href="https://www.coreweave.com/" target="_blank" rel="noopener noreferrer">
        <img src="/coreweave_logo.svg" alt="CoreWeave" className="mt-1 h-10" />
      </a>
    </div>
  );

  // ── Landing ──────────────────────────────────────────────────────────
  if (state === "landing") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <img
          src="/robots.gif"
          alt="Robots"
          className="mb-8 h-40 rounded-xl sm:h-48"
        />
        <p className="mb-4 text-lg text-zinc-400">
          Robots come in a lot of shapes and sizes.
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Today you will train a robot arm with
          <br />
          <span className="text-accent">GPU-accelerated RL</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-zinc-400">
          Launch a real reinforcement-learning training job using Isaac Lab on a
          NVIDIA RTX Pro 6000 Blackwell GPU running in CoreWeave&apos;s AI Cloud.
          This job will train a DexSuite Humanoid Arm to pick up an object from
          a table based on configs you provide.
        </p>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">
          Results stream live to your Weights&nbsp;&amp;&nbsp;Biases dashboard
          including the simulation videos.{" "}
          <a
            href="https://github.com/anu-wandb/wb-nvidia-isaac-lab/blob/main/NVIDIA_Isaac_Lab_WandB_Blueprint.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Read more about RL with Isaac Labs
          </a>.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          A W&amp;B account is needed to view results.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
          <button
            onClick={() => setState("config")}
            className="rounded-lg bg-accent px-8 py-3 text-lg font-semibold text-black transition hover:brightness-110"
          >
            Start Training &rarr;
          </button>
          <a
            href="https://wandb.ai/site"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-500"
          >
            Sign up for a W&amp;B account
          </a>
        </div>
        {poweredBy}
      </main>
    );
  }

  // ── Running ──────────────────────────────────────────────────────────
  if (state === "running" && result) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-5xl">🚀</p>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Your training job is running!</h1>
        <p className="mt-4 max-w-lg text-zinc-400">
          You should soon see your W&amp;B dashboard with simulation videos and metrics from the training job.
        </p>

        <img
          src="/demo.gif"
          alt="W&B dashboard demo"
          className="mt-6 w-full max-w-3xl rounded-xl"
        />

        <p className="mt-4 text-sm text-zinc-500">
          The training environment can take up to 5–10 minutes to spin up.
          <br />
          Your dashboard will be available through the view dashboard button once the training starts.
        </p>

        <a
          href={result.wandb_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block rounded-lg bg-accent px-8 py-3 text-lg font-semibold text-black transition hover:brightness-110"
        >
          View your W&amp;B dashboard &rarr;
        </a>

        <p className="mt-6 text-sm text-zinc-500">
          You&apos;ve used {result.runs_used} of {runsMax} runs for team{" "}
          <span className="text-zinc-300">{result.team_name}</span>
        </p>
        <p className="mt-3 max-w-lg text-sm text-zinc-500">
          You are getting free access to CoreWeave AI Cloud and W&amp;B software for tracking the ML training to run these jobs.
        </p>

        {runsRemaining !== null && runsRemaining > 0 && (
          <button
            onClick={() => {
              setError("");
              setResult(null);
              setState("config");
            }}
            className="mt-4 rounded-lg border border-zinc-700 px-6 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
          >
            Queue another run
          </button>
        )}

        {/* Blueprint card */}
        <div className="mt-12 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 text-left">
          <h2 className="text-lg font-semibold text-zinc-100">Scale it up on your infra</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Run this yourself on any NVIDIA RTX GPU cluster using the NVIDIA + W&amp;B Isaac Lab Blueprint.
          </p>
          <a
            href="https://github.com/anu-wandb/wb-nvidia-isaac-lab/blob/main/NVIDIA_Isaac_Lab_WandB_Blueprint.md"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-lg border border-accent/40 px-5 py-2 text-sm font-medium text-accent transition hover:bg-accent/10"
          >
            View the Blueprint &rarr;
          </a>
        </div>
        {poweredBy}
      </main>
    );
  }

  // ── Config ───────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold sm:text-3xl">Configure your training run</h1>

        {/* Team name */}
        <label className="mt-8 block text-sm font-medium text-zinc-300">
          Your W&amp;B team name
        </label>
        <p className="mt-1 text-xs text-zinc-600">Your team name is part of your W&amp;B URL: wandb.ai/&lt;team-name&gt;. Use &lt;team-name&gt; here.</p>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="my-team"
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 outline-none focus:border-accent"
        />

        {/* Runs remaining badge */}
        {runsRemaining !== null && (
          <p className={`mt-2 text-sm ${runsRemaining === 0 ? "text-red-400" : "text-zinc-400"}`}>
            {runsRemaining} of {runsMax} runs remaining
          </p>
        )}

        {/* API key */}
        <label className="mt-6 block text-sm font-medium text-zinc-300">
          Your W&amp;B API key <span className="text-xs text-zinc-600">(Your API key is never stored)</span>
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="paste your key here"
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-100 placeholder-zinc-600 outline-none focus:border-accent"
        />
        <a
          href="https://wandb.ai/authorize"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-block text-xs text-zinc-500 hover:text-zinc-300"
        >
          Get your key at wandb.ai/authorize
        </a>

        {/* Advanced settings */}
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="mt-8 flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
        >
          <svg
            className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Advanced settings
        </button>

        {advancedOpen && (
          <div className="mt-4 space-y-5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
            {/* Num envs slider */}
            <div className="group/env relative">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">Parallel environments</span>
                <span className="font-mono text-accent">{numEnvs}</span>
              </div>
              <div className="pointer-events-none absolute left-0 right-0 -bottom-12 z-10 rounded-md bg-zinc-800 px-3 py-2 text-xs text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover/env:opacity-100">
                Each environment is an independent simulation. More Environments = Faster Training.
              </div>
              {(() => {
                const envOptions = [512, 1024, 4096, 8192, 16384];
                const idx = envOptions.indexOf(numEnvs);
                return (
                  <input
                    type="range"
                    min={0}
                    max={envOptions.length - 1}
                    step={1}
                    value={idx === -1 ? 1 : idx}
                    onChange={(e) => setNumEnvs(envOptions[Number(e.target.value)])}
                    className="mt-2 w-full"
                  />
                );
              })()}
            </div>

            {/* Max iterations slider */}
            <div className="group/iter relative">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-300">Training iterations</span>
                <span className="font-mono text-accent">{maxIter}</span>
              </div>
              <div className="pointer-events-none absolute left-0 right-0 -bottom-12 z-10 rounded-md bg-zinc-800 px-3 py-2 text-xs text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover/iter:opacity-100">
                Each iteration is a full batch of experience. Dexsuite lift task typically converges around 800–1200.
              </div>
              <input
                type="range"
                min={500}
                max={1500}
                step={100}
                value={maxIter}
                onChange={(e) => setMaxIter(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-8 w-full rounded-lg bg-accent py-3 text-lg font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Validating...
            </span>
          ) : (
            "Run Training"
          )}
        </button>

        {/* Error */}
        {error && (
          <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-2.5 text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
      {poweredBy}
    </main>
  );
}
