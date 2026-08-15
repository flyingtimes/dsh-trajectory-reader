/**
 * Headless smoke test for the trajectory-reader client bundle.
 * Loads the module-loader factory, exercises apply() (registers the
 * conversation.view tab), and validates the rules-based per-round
 * interpreter against sample ConversationNodes.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const HARNESS_NM = "/Users/clark/.npm/_npx/1e7f6d9597241db0/node_modules";
const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
const requireFromHarness = createRequire(path.join(HARNESS_NM, "_resolve-from.js"));
const react = requireFromHarness("react");
const jsxRuntime = requireFromHarness("react/jsx-runtime");

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("  ok  " + name);
  else { failures++; console.error("FAIL  " + name + (extra ? " — " + extra : "")); }
}

// ── load + materialize ──
let loadedRec = null;
globalThis.window = globalThis.window || {};
window.__ModuleLoader__ = { load(rec) { loadedRec = rec; } };
new Function("window", clientSrc)(window);
check("bundle registers a module-loader record", !!loadedRec && typeof loadedRec.factory === "function");

let mod = null;
try {
  mod = loadedRec.factory((id) => {
    if (id === "react") return react;
    if (id === "react/jsx-runtime") return jsxRuntime;
    throw new Error("unexpected require(" + id + ")");
  });
  check("factory materializes and exports plugin surface", typeof mod.apply === "function" && Array.isArray(mod.inject) && typeof mod.interpret === "function");
  check("plugin declares the slots service", Array.isArray(mod.inject) && mod.inject.indexOf("slots") !== -1);
} catch (err) {
  check("factory materializes", false, err.stack);
  process.exit(1);
}

// ── apply registers the conversation.view tab ──
const registrations = [];
const fakeCtx = {
  effect(fn) { return fn() || (() => {}); },
  slots: {
    register(opts, comp) { registrations.push({ slot: opts.name, id: opts.id, label: opts.label(), order: opts.order, comp: typeof comp }); return () => {}; },
    inject(key, cb) { check("apply waits on conversation.view slot", key === "conversation.view", key); cb(); return () => {}; }
  }
};
try {
  mod.apply(fakeCtx);
  const r = registrations[0];
  check("apply registers the 轨迹解读 tab", !!r && r.slot === "conversation.view" && r.id === "trajectory-reader", JSON.stringify(registrations));
  check("tab label is 轨迹解读", !!r && r.label === "轨迹解读", r && r.label);
  check("tab renders a React component", !!r && r.comp === "function");
} catch (err) {
  check("apply() runs without throwing", false, err.stack);
}

// ── interpreter: per-user-round segmentation ──
try {
  const sample = [
    { kind: "user", seq: 1, content: [{ type: "text", text: "帮我做一个雷电游戏" }] },
    { kind: "assistant", seq: 2, turn: 0, blocks: [
      { kind: "text", text: "好的，我来实现。" },
      { kind: "tool-call", callId: "c1", name: "write", argsRaw: JSON.stringify({ path: "client.js", content: "..." }) }
    ] },
    { kind: "tool-result", seq: 3, call: { name: "write", argsRaw: "{}" }, content: [{ type: "text", text: "ok" }], isError: false },
    { kind: "assistant", seq: 4, turn: 0, blocks: [
      { kind: "tool-call", callId: "c2", name: "bash", argsRaw: JSON.stringify({ command: "node test/smoke.mjs" }) }
    ] },
    { kind: "tool-result", seq: 5, call: { name: "bash", argsRaw: "{}" }, content: [{ type: "text", text: "PASS" }], isError: true, error: { name: "code1", code: "E1" } },
    { kind: "assistant", seq: 6, turn: 0, blocks: [{ kind: "text", text: "完成。" }] },
    { kind: "user", seq: 7, content: [{ type: "text", text: "再优化一下" }] },
    { kind: "assistant", seq: 8, turn: 1, blocks: [{ kind: "reasoning", text: "考虑光影" }, { kind: "text", text: "已优化" }] }
  ];
  const out = mod.interpret(sample);
  check("segments one round per user message", out.rounds.length === 2 && out.stats.rounds === 2, "rounds=" + out.rounds.length);
  check("counts user messages", out.stats.user === 2, "user=" + out.stats.user);
  check("counts tool calls", out.stats.toolCalls === 2, "toolCalls=" + out.stats.toolCalls);
  check("counts errors", out.stats.errors === 1, "errors=" + out.stats.errors);
  check("collects touched files", out.stats.files.indexOf("client.js") !== -1, JSON.stringify(out.stats.files));
  check("collects tool types", out.stats.toolTypes.write === 1 && out.stats.toolTypes.bash === 1, JSON.stringify(out.stats.toolTypes));

  const r1 = out.rounds[0];
  check("keeps user text unchanged (原文)", r1.userText === "帮我做一个雷电游戏", JSON.stringify(r1.userText));
  check("condenses the demand", r1.demand === "帮我做一个雷电游戏", JSON.stringify(r1.demand));
  check("round owns its actions in order", r1.actions.length === 2 && r1.actions[0].name === "write" && r1.actions[1].name === "bash", JSON.stringify(r1.actions.map(a => a.name)));
  const cats1 = r1.categories.map((c) => c.cat);
  check("classifies write as 实现", cats1.indexOf("build") !== -1, JSON.stringify(cats1));
  check("classifies `node test/smoke.mjs` as 验证", cats1.indexOf("verify") !== -1, JSON.stringify(cats1));
  check("实现 summary names the file", r1.categories.some((c) => c.cat === "build" && c.descs.some((d) => d.indexOf("client.js") !== -1)), JSON.stringify(r1.categories));
  check("round records the tool error", r1.errors.length === 1 && r1.errors[0].indexOf("bash") === 0, JSON.stringify(r1.errors));
  check("reply gist leads with the first reply", r1.replyGist.indexOf("好的，我来实现。") === 0, JSON.stringify(r1.replyGist));
  check("full reply preserved", r1.replyAll.indexOf("完成。") !== -1, JSON.stringify(r1.replyAll));

  const r2 = out.rounds[1];
  check("second round segments from its user message", r2.userText === "再优化一下" && r2.demand === "再优化一下", JSON.stringify(r2.userText));
  check("round without tool calls has no categories", r2.categories.length === 0 && r2.actions.length === 0, JSON.stringify(r2.categories));
  check("reply gist kept for tool-less round", r2.replyGist === "已优化", JSON.stringify(r2.replyGist));
} catch (err) {
  check("per-round interpreter runs without throwing", false, err.stack);
}

// ── interpreter: steering, long text condensation, notes ──
try {
  const longText = "功能基本具备。我希望轨迹解读的功能是突出用户的需求是什么，assistant是如何做来完成用户的需求的。要按照原来用户的轮次，一轮轮的总结呈现。另外还希望在顶部保留整体统计信息，方便快速把握全貌，同时兼顾移动端排版与深浅色主题。";
  const sample2 = [
    { kind: "user", seq: 1, content: [{ type: "text", text: longText }] },
    { kind: "assistant", seq: 2, turn: 0, blocks: [
      { kind: "tool-call", callId: "c1", name: "read", argsRaw: JSON.stringify({ path: "README.md" }) },
      { kind: "tool-call", callId: "c2", name: "grep", argsRaw: JSON.stringify({ pattern: "conversation.view" }) },
      { kind: "tool-call", callId: "c3", name: "edit", argsRaw: JSON.stringify({ path: "client.js" }) },
      { kind: "tool-call", callId: "c4", name: "todo_write", argsRaw: JSON.stringify({ todos: [] }) }
    ] },
    { kind: "steering", seq: 3, content: [{ type: "text", text: "记得加上错误统计" }] },
    { kind: "assistant", seq: 4, turn: 0, blocks: [{ kind: "text", text: "已按要求补充。" }] },
    { kind: "user", seq: 5, content: [{ type: "text", text: "第二个需求" }] },
    { kind: "compaction", seq: 6, summary: null },
    { kind: "turn-max-tokens", seq: 7, turn: 1, step: 2 },
    { kind: "assistant", seq: 8, turn: 1, blocks: [{ kind: "text", text: "回答" }] }
  ];
  const out = mod.interpret(sample2);
  check("steering message starts its own supplement round", out.rounds.length === 3, "rounds=" + JSON.stringify(out.rounds.map((r) => r.supplement)));
  check("supplement flag set on steering round", out.rounds[1].supplement === true && out.rounds[1].demand === "记得加上错误统计", JSON.stringify(out.rounds[1].demand));
  check("long demand is condensed with ellipsis", out.rounds[0].demand.length <= 82 && out.rounds[0].demand.slice(-1) === "…", out.rounds[0].demand);
  check("condensed demand leads with the first sentence", out.rounds[0].demand.indexOf("功能基本具备。") === 0, out.rounds[0].demand);
  const cats = out.rounds[0].categories.map((c) => c.cat);
  check("read/grep classified as 调研", cats.indexOf("recon") !== -1, JSON.stringify(cats));
  check("edit classified as 实现", cats.indexOf("build") !== -1, JSON.stringify(cats));
  check("todo_write classified as 规划 and ordered first", cats[0] === "plan", JSON.stringify(cats));
  const notes3 = out.rounds[2].notes.join("|");
  check("compaction and max-tokens surfaced as notes", notes3.indexOf("压缩") !== -1 && notes3.indexOf("截断") !== -1, notes3);
} catch (err) {
  check("extended interpreter runs without throwing", false, err.stack);
}

// ── AI material framing ──
try {
  const sample = [
    { kind: "user", seq: 1, content: [{ type: "text", text: "帮我做一个雷电游戏" }] },
    { kind: "assistant", seq: 2, turn: 0, blocks: [
      { kind: "reasoning", text: "先读 README" },
      { kind: "tool-call", callId: "c1", name: "write", argsRaw: JSON.stringify({ path: "client.js" }) }
    ] },
    { kind: "assistant", seq: 3, turn: 0, blocks: [{ kind: "text", text: "完成。" }] }
  ];
  const out = mod.interpret(sample);
  const mat = mod.buildRoundMaterial(out.rounds[0]);
  check("material carries the round index", mat["轮次"] === 1, JSON.stringify(mat["轮次"]));
  check("material carries user text", mat["用户消息"] === "帮我做一个雷电游戏", JSON.stringify(mat["用户消息"]));
  check("material carries reply and reasoning", mat["助手回复"] === "完成。" && mat["助手思考节选"] === "先读 README", JSON.stringify(mat));
  check("material carries ordered tool actions", mat["工具调用顺序"].length === 1 && mat["工具调用顺序"][0]["工具"] === "write", JSON.stringify(mat["工具调用顺序"]));
  check("material strips system-reminder noise", mod.buildRoundMaterial({ index: 1, userText: "A<system-reminder>x</system-reminder>B", supplement: false, replyAll: "", reasoning: [], actions: [], errors: [], notes: [] })["用户消息"] === "AB", "");
  const k1 = mod.materialKey(mod.buildRoundMaterial(out.rounds[0]));
  const k2 = mod.materialKey(mod.buildRoundMaterial(out.rounds[0]));
  const mat3 = mod.buildRoundMaterial(out.rounds[0]); mat3["用户消息"] = "改了";
  check("material key stable for same input, differs when changed", k1 === k2 && mod.materialKey(mat3) !== k1, k1);
  check("summarize endpoint path exported", mod.SUMMARIZE_URL === "/plugin-api/trajectory-reader/summarize", mod.SUMMARIZE_URL);
} catch (err) {
  check("material framing runs without throwing", false, err.stack);
}

// ── server half: route registration + prompt + LLM assembly ──
const serverMod = await import(new URL("../index.js", import.meta.url).href);
try {
  const routes = [];
  const fakeCtx = {
    webServer: { register(route) { routes.push(route); return () => {}; } },
    llm: { async *stream(options) {
      capturedPrompt = options;
      yield { type: "block-start", index: 0, blockType: "text" };
      yield { type: "text-delta", index: 0, text: "### 用户需求\n做游戏\n### 执行过程\n1. 写 `client.js`" };
      yield { type: "block-end", index: 0, block: { type: "text", text: "### 用户需求\n做游戏\n### 执行过程\n1. 写 `client.js`" } };
      yield { type: "finish", reason: { kind: "stop" } };
    } },
    get() { return undefined; }
  };
  let capturedPrompt = null;
  serverMod.apply(fakeCtx);
  check("server half registers the summarize route", routes.length === 1 && routes[0].path === "/plugin-api/trajectory-reader/summarize" && routes[0].kind === "exact", JSON.stringify(routes.map(r => r.path)));
  check("server half declares llm+webServer deps", Array.isArray(serverMod.inject) && serverMod.inject.join(",") === "llm,webServer", JSON.stringify(serverMod.inject));

  // Prompt quality gates.
  const p = serverMod.SYSTEM_PROMPT;
  check("prompt states the interpreter role", p.includes("会话轨迹解读员"), "");
  check("prompt demands 用户需求/思路/执行过程/结果 sections", ["### 用户需求", "### 助手思路", "### 执行过程", "### 结果"].every((s) => p.includes(s)), "");
  check("prompt forbids fabrication", p.includes("禁止编造"), "");
  check("prompt demands causal process narration", p.includes("因果关系"), "");
  check("prompt caps length and asks direct output", p.includes("不超过 400 字") && p.includes("不要输出任何开场白"), "");

  // POST handler end-to-end with a stub LLM stream.
  const res = { headers: {}, body: "", code: 0, writeHead(code, headers) { this.code = code; this.headers = headers; }, end(b) { this.body = b; } };
  const reqBody = JSON.stringify({ rounds: [{ key: "k1", material: { 用户消息: "帮我做一个雷电游戏" } }] });
  const fakeReq = {
    method: "POST",
    on(ev, fn) { if (ev === "data") fn(Buffer.from(reqBody)); if (ev === "end") fn(); }
  };
  await routes[0].handler(fakeReq, res);
  const parsed = JSON.parse(res.body);
  check("POST returns ok with one result", res.code === 200 && parsed.ok === true && parsed.results.length === 1, res.body);
  check("result text assembled from stream chunks", parsed.results[0].ok === true && parsed.results[0].text.includes("### 用户需求") && parsed.results[0].text.includes("`client.js`"), res.body);
  check("default route falls back without agentDefaultModel", parsed.route.provider === "deepseek-official" && parsed.route.model === "deepseek-v4-flash", JSON.stringify(parsed.route));
  check("model call receives the framed JSON user message", capturedPrompt.messages[0].content[0].text.includes("帮我做一个雷电游戏") && capturedPrompt.messages[0].content[0].text.includes("JSON"), JSON.stringify(capturedPrompt.messages));
  check("model call receives the system prompt and token cap", capturedPrompt.system === serverMod.SYSTEM_PROMPT && capturedPrompt.maxTokens > 0, "");

  // GET probe.
  const res2 = { headers: {}, body: "", code: 0, writeHead(code, headers) { this.code = code; this.headers = headers; }, end(b) { this.body = b; } };
  await routes[0].handler({ method: "GET" }, res2);
  check("GET probe answers availability", res2.code === 200 && JSON.parse(res2.body).ok === true, res2.body);

  // Bad body → 400.
  const res3 = { headers: {}, body: "", code: 0, writeHead(code, headers) { this.code = code; this.headers = headers; }, end(b) { this.body = b; } };
  const badBody = "not-json";
  await routes[0].handler({ method: "POST", on(ev, fn) { if (ev === "data") fn(Buffer.from(badBody)); if (ev === "end") fn(); } }, res3);
  check("invalid JSON body → 400", res3.code === 400, res3.body);
} catch (err) {
  check("server half runs without throwing", false, err.stack);
}

console.log(failures === 0 ? "\nALL SMOKE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
