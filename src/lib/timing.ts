/**
 * Per-step latency logging for the design pipeline.
 *
 * The pipeline is six sequential round-trips (analyze → recommend → search →
 * curate → generate → save) and nothing measured any of them, so "it takes over
 * a minute" had no breakdown behind it. Each call emits one structured line to
 * the Vercel log:
 *
 *   {"tag":"step_ms","step":"generate-image.render","ms":24310,"ok":true}
 *
 * Server ms covers only the work inside the route. The client emits its own
 * per-step wall-clock (`pipeline_timing` funnel event); the gap between the two
 * is request/response transfer — which is the number that matters for mobile
 * Instagram traffic pushing multi-MB base64 images up a phone uplink.
 *
 * Never changes behaviour: the result (or the throw) passes straight through.
 */
export async function timed<T>(
  step: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>
): Promise<T> {
  const t0 = Date.now();
  let ok = false;
  try {
    const result = await fn();
    ok = true;
    return result;
  } finally {
    console.log(
      JSON.stringify({ tag: "step_ms", step, ms: Date.now() - t0, ok, ...extra })
    );
  }
}
