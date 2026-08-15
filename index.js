/**
 * 轨迹解读 · TRAJECTORY READER — server half.
 *
 * Activated by the web profile's Loader row (cordis.patch.yml). Registers one
 * exact web route the client bundle calls for LLM-powered per-round narrative
 * summaries:
 *
 *   GET  /plugin-api/trajectory-reader/summarize   → availability probe
 *   POST /plugin-api/trajectory-reader/summarize   → { provider?, model?, rounds: [...] }
 *
 * Each round is framed as JSON and summarized through the host `llm` service
 * (default route = the live agent default model selection). Uses no package
 * imports so it resolves inside any profile that links this package.
 */

/** Route path owned by this plugin (named routes win over the SPA fallback). */
const SUMMARIZE_PATH = "/plugin-api/trajectory-reader/summarize";
/** Max rounds accepted per request (each is one model call). */
const MAX_ROUNDS_PER_REQUEST = 12;
/** Per-round model-call budget. */
const MAX_OUTPUT_TOKENS = 1200;
const CALL_TIMEOUT_MS = 120000;
/** Server-side re-cap of every string we forward to the model. */
const MAX_TEXT_CHARS = 4000;

/**
 * The summarizer system prompt: interpret ONE user round of a coding-agent
 * session — what the user wanted, how the assistant thought and executed,
 * and what it achieved — strictly grounded in the supplied material.
 */
const SYSTEM_PROMPT = [
  "你是 DeepSeek Harness（编程助手框架）的「会话轨迹解读员」。用户会给你一轮会话的原始材料，包括：该轮的用户消息原文、助手的回复与思考节选、按发生顺序排列的工具调用记录（工具名与参数摘要）、出现的错误与系统备注。",
  "你的任务：用中文把这一轮「用户要什么，助手是怎么思考、怎么一步步执行的，最终结果如何」写成一段连贯的解读，让没有看过原始会话的人也能明白助手做了什么、为什么这么做。",
  "",
  "必须遵守：",
  "1. 只依据材料中给出的信息解读，禁止编造材料里没有的文件、命令、结论或原因；材料若有截断（出现「…」），不要猜测被截断的内容。",
  "2. 输出使用以下 Markdown 结构（保留三个#的标题行，顺序不变）：",
  "",
  "### 用户需求",
  "（一两句话概括这一轮用户想要什么；若有多条消息或中途补充，请合并表述）",
  "",
  "### 助手思路",
  "（从回复、思考节选与动作顺序中提炼：助手选择了什么路线、为什么先做某事再做某事、遇到问题时如何调整）",
  "",
  "### 执行过程",
  "（按实际顺序用编号列表叙述：调研了什么、读/改/写了哪些文件、运行了哪些命令、委派了什么任务、遇到什么错误以及如何处理；同类动作可合并，但关键文件名、命令和报错要保留）",
  "",
  "### 结果",
  "（这一轮最终完成什么、主要改动落在哪里、还有什么未完成或失败的）",
  "",
  "3. 重点讲清「过程」与动作之间的因果关系（例如：先读 `A` 是为了确认 `B`，随后修改 `C` 来完成 `D`），不要只罗列工具名。",
  "4. 全文不超过 400 字；文件名、命令、错误信息一律用反引号包裹。",
  "5. 直接输出解读内容，不要输出任何开场白、结束语，也不要整段复述材料原文。"
].join("\n");

/** Assemble visible text from a raw chunk stream (no library imports). */
function assembleText(chunks) {
  const byIndex = new Map();
  const order = [];
  for (const chunk of chunks) {
    if (chunk.type === "block-start") {
      if (!byIndex.has(chunk.index)) { byIndex.set(chunk.index, ""); order.push(chunk.index); }
    } else if (chunk.type === "text-delta") {
      if (!byIndex.has(chunk.index)) { byIndex.set(chunk.index, ""); order.push(chunk.index); }
      byIndex.set(chunk.index, byIndex.get(chunk.index) + (chunk.text || ""));
    } else if (chunk.type === "block-end") {
      // Authoritative final block content replaces accumulated deltas.
      if (!byIndex.has(chunk.index)) order.push(chunk.index);
      byIndex.set(chunk.index, chunk.block && chunk.block.type === "text" ? chunk.block.text || "" : "");
    }
  }
  return order.sort((a, b) => a - b).map((i) => byIndex.get(i)).join("");
}

/** Read and cap one JSON request body. */
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Recursive sanitize: keep only plain JSON, cap every string. */
function sanitize(value) {
  if (typeof value === "string") return value.length > MAX_TEXT_CHARS ? value.slice(0, MAX_TEXT_CHARS) + "…" : value;
  if (Array.isArray(value)) return value.slice(0, 120).map(sanitize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value).slice(0, 40)) out[k] = sanitize(v);
    return out;
  }
  return value;
}

/** Frame one round's material so user text cannot break structural delimiters. */
function frameRound(material, index) {
  return `请解读第 ${index} 轮会话材料（JSON）：\n${JSON.stringify(sanitize(material))}`;
}

/** Resolve the model route: explicit override → live default selection → fallback. */
function resolveRoute(ctx, body) {
  if (typeof body.provider === "string" && body.provider && typeof body.model === "string" && body.model) {
    return { provider: body.provider, model: body.model, source: "session" };
  }
  const def = ctx.get("agentDefaultModel");
  if (def && typeof def.currentSelection === "function") {
    try {
      const sel = def.currentSelection();
      if (sel && typeof sel.provider === "string" && typeof sel.model === "string") {
        return { provider: sel.provider, model: sel.model, source: "default" };
      }
    } catch { /* fall through */ }
  }
  return { provider: "deepseek-official", model: "deepseek-v4-flash", source: "fallback" };
}

/** One-line diagnostic log (console + /tmp file); never throws. */
function logSummarize(sessionId, route, roundCount) {
  const line = `${new Date().toISOString()} session=${sessionId} route=${route.provider}/${route.model} source=${route.source} rounds=${roundCount}\n`;
  try {
    console.log(`[trajectory-reader] summarize ${line.trim()}`);
    import("node:fs").then((fs) => fs.appendFileSync("/tmp/tr-summarize.log", line)).catch(() => {});
  } catch { /* diagnostics must never break the route */ }
}

/** One round → one model call → { key, ok, text? , error? }. */
async function summarizeRound(ctx, route, key, material, index, signal) {
  try {
    const options = {
      provider: route.provider,
      model: route.model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [{ type: "text", text: frameRound(material, index) }] }],
      maxTokens: MAX_OUTPUT_TOKENS,
      signal
    };
    const chunks = [];
    for await (const chunk of ctx.llm.stream(options)) {
      if (signal.aborted) break;
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    const finish = chunks.find((c) => c.type === "finish");
    if (finish && finish.reason && finish.reason.kind === "error") {
      throw new Error(`model stream failed: ${finish.reason.error?.message || finish.reason.kind}`);
    }
    const text = assembleText(chunks).trim();
    if (!text) throw new Error("model produced no text");
    return { key, ok: true, text };
  } catch (err) {
    return { key, ok: false, error: err && err.message ? err.message : String(err) };
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

/** Cordis plugin entry: own the summarize route. */
export function apply(ctx) {
  ctx.webServer.register({
    kind: "exact",
    path: SUMMARIZE_PATH,
    handler: async (req, res) => {
      if (req.method === "GET" || req.method === "HEAD") {
        sendJson(res, 200, { ok: true, plugin: "trajectory-reader", path: SUMMARIZE_PATH });
        return;
      }
      if (req.method !== "POST") { sendJson(res, 405, { ok: false, error: "method not allowed" }); return; }
      let body;
      try {
        body = JSON.parse(await readBody(req, 4 * 1024 * 1024));
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid JSON body" });
        return;
      }
      if (!body || typeof body !== "object" || !Array.isArray(body.rounds) || body.rounds.length === 0) {
        sendJson(res, 400, { ok: false, error: "body must be { provider?, model?, rounds: [{ key, material }] }" });
        return;
      }
      const rounds = body.rounds.slice(0, MAX_ROUNDS_PER_REQUEST);
      const route = resolveRoute(ctx, body);
      const sid = typeof body.sessionId === "string" && body.sessionId ? body.sessionId.slice(0, 96) : "?";
      logSummarize(sid, route, rounds.length);
      const results = [];
      for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i];
        const key = typeof r.key === "string" ? r.key.slice(0, 128) : String(i);
        const material = sanitize(r.material && typeof r.material === "object" ? r.material : {});
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
        try {
          results.push(await summarizeRound(ctx, route, key, material, i + 1, ac.signal));
        } finally {
          clearTimeout(timer);
        }
      }
      sendJson(res, 200, { ok: true, route, results });
    }
  });
}

export const inject = ["llm", "webServer"];
export { SYSTEM_PROMPT, SUMMARIZE_PATH };
