/**
 * 轨迹解读 · TRAJECTORY READER
 *
 * A DeepSeek Harness web client plugin that adds a NEW tab 「轨迹解读」 to the
 * conversation view ring (beside 对话 / 轨迹), without touching the existing
 * trajectory page. It reads the session's conversation snapshot and renders a
 * rules-based, per-user-turn interpretation:
 *
 *   每一轮 = 一条用户消息 + 其后的全部助手活动
 *   ├── 🎯 用户需求      —— 提炼的一句/两句摘要（原文可展开）
 *   ├── 🛠 助手如何完成   —— 动作按 规划/调研/实现/验证/委派 归类总结
 *   │                      （读了什么、写了/改了什么、跑了什么命令、委派了什么）
 *   ├── ⚠ 错误 / 备注     —— 失败的工具调用、压缩、重试等
 *   └── 💬 助手回复（摘要）—— 回复开头摘要（全文可展开），操作明细可展开
 *
 * Reads `snapshot.nodes` (ConversationNode[]) via the standard `useSession`
 * selector hook supplied by the conversation view ring — no new data path.
 */
window.__ModuleLoader__.load({
  id: "@clarkchan/trajectory-reader",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var jsx = require("react/jsx-runtime");

    // ───────────────────────── styles ─────────────────────────
    var CSS_TAG = "@clarkchan/trajectory-reader/reader.css";
    var CSS = [
      ".tr-root{box-sizing:border-box;height:100%;min-height:0;color:var(--dsw-alias-label-primary,#e8e8f0);background:var(--dsw-alias-bg-base,#0b0d14);overflow:auto;padding:16px 20px 40px;font:var(--dsw-font-xs-13,13px/1.6 ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei',sans-serif)}",
      ".tr-root *{box-sizing:border-box}",
      ".tr-empty{color:var(--dsw-alias-label-tertiary,#8a93a6);text-align:center;padding:60px 20px}",
      ".tr-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}",
      ".tr-title{font-size:16px;font-weight:700;letter-spacing:.05em;color:var(--dsw-alias-label-primary,#e8e8f0)}",
      ".tr-stats{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 6px}",
      ".tr-stat{border:1px solid var(--dsw-alias-border-l2,#2a3142);background:var(--dsw-alias-bg-layer-1,#12161f);border-radius:999px;padding:3px 10px;font-size:12px;color:var(--dsw-alias-label-secondary,#b6bfd0)}",
      ".tr-stat b{color:var(--dsw-alias-label-primary,#e8e8f0);font-weight:700}",
      ".tr-note{color:var(--dsw-alias-label-tertiary,#8a93a6);font-size:12px;margin:0 0 14px}",

      // ── 一轮卡片 ──
      ".tr-turn{border:1px solid var(--dsw-alias-border-l1,#222838);background:var(--dsw-alias-bg-layer-1,#12161f);border-radius:12px;margin:12px 0;overflow:hidden}",
      ".tr-turn-head{display:flex;align-items:center;gap:8px;padding:8px 14px;font-size:12px;font-weight:650;color:var(--dsw-alias-label-tertiary,#8a93a6);border-bottom:1px solid var(--dsw-alias-border-l1,#222838);background:var(--dsw-alias-bg-module-platform,rgba(120,130,160,.08));flex-wrap:wrap}",
      ".tr-turn-num{color:var(--dsw-alias-state-business-primary,#5b9dff)}",
      ".tr-err-n{color:var(--dsw-alias-state-error-primary,#ff5a6e)}",

      // 🎯 用户需求
      ".tr-demand{margin:12px 14px;padding:10px 12px;border-left:3px solid var(--dsw-alias-state-business-primary,#5b9dff);background:var(--dsw-alias-state-business-tertiary,rgba(91,157,255,.08));border-radius:8px}",
      ".tr-demand-label{display:block;font-size:11px;color:var(--dsw-alias-state-business-primary,#5b9dff);margin-bottom:5px;font-weight:700;letter-spacing:.04em}",
      ".tr-demand-text{font-size:14px;font-weight:650;line-height:1.65;color:var(--dsw-alias-label-primary,#e8e8f0);white-space:pre-wrap;word-break:break-word}",

      // 🛠 助手如何完成
      ".tr-how{margin:12px 14px;padding:10px 12px;border-left:3px solid #8b7cf6;background:rgba(139,124,246,.06);border-radius:8px}",
      ".tr-how-label{display:block;font-size:11px;color:#a89bff;margin-bottom:6px;font-weight:700;letter-spacing:.04em}",
      ".tr-phase{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 8px}",
      ".tr-phase-chip{border:1px solid rgba(139,124,246,.35);color:#c9c2ff;background:rgba(139,124,246,.10);border-radius:999px;padding:1px 9px;font-size:11.5px;font-weight:650}",
      ".tr-bullet{margin:4px 0;font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary,#b6bfd0)}",
      ".tr-bullet .tr-k{color:var(--dsw-alias-label-tertiary,#8a93a6)}",
      ".tr-none{color:var(--dsw-alias-label-tertiary,#8a93a6);font-size:12.5px}",

      // ⚠ 错误 / 备注
      ".tr-errors{margin:8px 14px;padding:8px 12px;border-left:3px solid var(--dsw-alias-state-error-primary,#ff5a6e);background:var(--dsw-alias-state-error-tertiary,rgba(255,90,110,.08));border-radius:8px;color:var(--dsw-alias-state-error-primary,#ff5a6e);font-size:12.5px;white-space:pre-wrap}",
      ".tr-context{margin:6px 14px;font-size:12px;color:var(--dsw-alias-label-tertiary,#8a93a6)}",

      // 💬 助手回复（摘要）
      ".tr-reply{margin:12px 14px;padding:10px 12px;border-left:3px solid #56c8a8;background:rgba(86,200,168,.07);border-radius:8px}",
      ".tr-reply-label{display:block;font-size:11px;color:#56c8a8;margin-bottom:5px;font-weight:700;letter-spacing:.04em}",
      ".tr-reply-text{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-primary,#e8e8f0);white-space:pre-wrap;word-break:break-word}",

      // 展开块（原文 / 操作明细）
      ".tr-details{margin:8px 14px 12px;font-size:12px}",
      ".tr-details summary{cursor:pointer;color:var(--dsw-alias-label-tertiary,#8a93a6);user-select:none;list-style:none;display:inline-flex;align-items:center;gap:4px}",
      ".tr-details summary::before{content:'▸';font-size:10px;transition:transform .12s}",
      ".tr-details[open] summary::before{transform:rotate(90deg)}",
      ".tr-details summary:hover{color:var(--dsw-alias-label-secondary,#b6bfd0)}",
      ".tr-orig{margin-top:6px;padding:8px 10px;border:1px dashed var(--dsw-alias-border-l2,#2a3142);border-radius:8px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary,#b6bfd0);font-size:12px;line-height:1.7;max-height:260px;overflow:auto}",
      ".tr-tools{margin-top:6px;display:flex;flex-direction:column;gap:5px}",
      ".tr-tool{display:flex;align-items:baseline;gap:8px;font-size:12.5px;line-height:1.6}",
      ".tr-tool-name{flex:none;font-weight:700;color:var(--dsw-alias-state-warn-label,#e8b64c)}",
      ".tr-tool-args{color:var(--dsw-alias-label-secondary,#b6bfd0);word-break:break-all}",
      ".tr-code{font:12px/1.7 var(--ds-font-family-code,Menlo,Consolas,monospace);color:var(--dsw-alias-label-secondary,#b6bfd0);background:var(--dsw-alias-markdown-code-block,rgba(120,130,160,.1));border-radius:6px;padding:2px 6px;word-break:break-all}",

      // ✨ AI 过程解读
      ".tr-ai{margin:12px 14px;padding:10px 14px 12px;border:1px solid rgba(139,124,246,.4);border-left:3px solid #8b7cf6;background:linear-gradient(180deg,rgba(139,124,246,.10),rgba(139,124,246,.04));border-radius:10px}",
      ".tr-ai-label{display:flex;align-items:center;gap:6px;font-size:11px;color:#a89bff;margin-bottom:6px;font-weight:700;letter-spacing:.04em}",
      ".tr-ai-route{font-weight:400;color:var(--dsw-alias-label-tertiary,#8a93a6)}",
      ".tr-ai-text{font-size:12.5px;line-height:1.75;color:var(--dsw-alias-label-primary,#e8e8f0);white-space:pre-wrap;word-break:break-word}",
      ".tr-ai-h{display:block;margin:8px 0 3px;font-size:12.5px;font-weight:700;color:#c9c2ff}",
      ".tr-ai-status{font-size:12px;color:var(--dsw-alias-label-tertiary,#8a93a6)}",
      ".tr-ai-err{font-size:12px;color:var(--dsw-alias-state-error-primary,#ff5a6e);white-space:pre-wrap;word-break:break-word}",
      ".tr-ai-pending{border:1px solid rgba(139,124,246,.55)!important;background:linear-gradient(100deg,rgba(139,124,246,.16) 30%,rgba(139,124,246,.30) 50%,rgba(139,124,246,.16) 70%)!important;background-size:200% 100%!important;animation:trShimmer 1.4s linear infinite}",
      "@keyframes trShimmer{to{background-position:-200% 0}}",
      ".tr-btn{cursor:pointer;border:1px solid rgba(139,124,246,.45);background:rgba(139,124,246,.12);color:#c9c2ff;border-radius:999px;padding:2px 11px;font-size:11.5px;font-weight:650;line-height:1.6}",
      ".tr-btn:hover{background:rgba(139,124,246,.22)}",
      ".tr-btn:disabled{opacity:.5;cursor:default}",
      ".tr-btn-head{margin-left:auto}",
      ".tr-ai-hint{font-size:11.5px;color:var(--dsw-alias-label-caption,#6b7280)}",

      ".tr-foot{color:var(--dsw-alias-label-caption,#6b7280);font-size:11.5px;margin-top:18px;text-align:center}"
    ].join("");
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"" + CSS_TAG + "\"]") === null) {
      var tag = document.createElement("style");
      tag.dataset.plugin = "@clarkchan/trajectory-reader";
      tag.dataset.pluginCss = CSS_TAG;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ───────────────────────── text helpers ─────────────────────────

    function blockText(block) {
      if (!block) return "";
      if (typeof block.text === "string") return block.text;
      if (typeof block === "string") return block;
      return "";
    }

    /** Extract a plain-text representation of a node's content blocks. */
    function nodeText(node) {
      var parts = [];
      var content = node && node.content;
      if (Array.isArray(content)) {
        for (var i = 0; i < content.length; i++) {
          var t = blockText(content[i]);
          if (t) parts.push(t);
        }
      } else if (typeof content === "string" && content.trim()) {
        parts.push(content);
      }
      return parts.join("\n").trim();
    }

    function parseArgs(raw) {
      if (!raw) return {};
      try {
        var v = JSON.parse(raw);
        return v && typeof v === "object" ? v : {};
      } catch (e) { return {}; }
    }

    function truncate(s, n) {
      s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
      return s.length > n ? s.slice(0, n - 1) + "…" : s;
    }

    /** Remove envelope noise (system reminders etc.) before summarizing. */
    function stripNoise(s) {
      return String(s == null ? "" : s)
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
        .replace(/<command-message>[\s\S]*?<\/command-message>/g, "");
    }

    var SENT_END = /([。！？!?；;]|\n+)/;

    /**
     * Condense a text into a short gist: keep up to `maxSents` leading
     * sentences within `maxChars`; append an ellipsis when trimmed.
     */
    function condense(text, maxChars, maxSents) {
      var raw = String(text == null ? "" : text).replace(/\r/g, "");
      var flat = raw.replace(/\s+/g, " ").trim();
      if (!flat) return "";
      if (flat.length <= maxChars) return flat;
      var parts = raw.split(SENT_END);
      var sentences = [], cur = "";
      for (var i = 0; i < parts.length; i++) {
        cur += parts[i];
        if (SENT_END.test(parts[i]) || i === parts.length - 1) {
          var s = cur.replace(/\s+/g, " ").trim();
          if (s) sentences.push(s);
          cur = "";
        }
      }
      var out = "", count = 0;
      for (var j = 0; j < sentences.length; j++) {
        if (count >= maxSents || (out + (out ? " " : "") + sentences[j]).length > maxChars) break;
        out += (out ? " " : "") + sentences[j];
        count++;
      }
      if (!out) out = flat.slice(0, maxChars);
      if (out.length < flat.length) out += "…";
      return out;
    }

    // ───────────────────────── action classification ─────────────────────────

    var FILE_TOOLS = { write: 1, create_file: 1, overwrite_file: 1, edit: 1, append_file: 1, patch: 1, read: 1, glob: 1 };

    var CAT_ORDER = ["plan", "recon", "build", "verify", "delegate", "other"];
    var CAT_LABEL = { plan: "规划", recon: "调研", build: "实现", verify: "验证", delegate: "委派", other: "其他" };
    var CAT_TOOLS = {
      todo_write: "plan", todo: "plan", task: "plan", task_list: "plan", create_goal: "plan", update_goal: "plan", get_goal: "plan",
      read: "recon", glob: "recon", grep: "recon", search_content: "recon", find: "recon", read_image: "recon",
      web_search: "recon", search: "recon",
      write: "build", create_file: "build", overwrite_file: "build", edit: "build", append_file: "build", patch: "build",
      subagent: "delegate", subagent_fork: "delegate", workflow: "delegate", ralph: "delegate", send_message: "delegate", interrupt_agent: "delegate"
    };
    var BASH_NAMES = { bash: 1, terminal: 1, shell: 1, "terminal-bash": 1, pwsh: 1 };
    var VERIFY_RE = /(^|[^a-z0-9])(test|tests|check|smoke|lint|vitest|jest|pytest|spec|tsc|verify)([^a-z0-9]|$)/i;
    var LOOK_RE = /(^|[^a-z0-9-])(ls|cat|head|tail|pwd|which|find|grep|rg|stat|file|du|df)([^a-z0-9]|$)|git (status|log|diff|show|branch)/i;

    function categoryFor(name, argsRaw) {
      if (CAT_TOOLS[name]) return CAT_TOOLS[name];
      if (BASH_NAMES[name]) {
        var a = parseArgs(argsRaw);
        var cmd = String(a.command || a.cmd || a.script || "");
        if (VERIFY_RE.test(cmd)) return "verify";
        if (LOOK_RE.test(cmd)) return "recon";
        return "build";
      }
      return "other";
    }

    /** Human-readable one-line description of a tool call. */
    function toolCallText(name, argsRaw) {
      var args = parseArgs(argsRaw);
      var path = args.path || args.file || args.filename || args.pattern || args.pathname;
      if (name === "write" || name === "create_file") return "写入文件 " + (path || "?");
      if (name === "edit" || name === "overwrite_file" || name === "append_file" || name === "patch") return "修改文件 " + (path || "?");
      if (name === "read") return "读取文件 " + (path || "?");
      if (name === "glob") return "查找文件 " + truncate(path || "", 40);
      if (name === "grep" || name === "search_content") return "搜索内容 " + truncate(args.pattern || args.query || "", 40);
      if (BASH_NAMES[name]) return "运行命令 " + truncate(args.command || args.cmd || args.script || "", 60);
      if (name === "web_search" || name === "search") return "网络搜索 " + truncate(args.query || "", 40);
      if (name === "read_image") return "查看图片 " + (path || "?");
      if (name === "todo_write" || name === "todo" || name === "task" || name === "task_list") return "维护任务清单";
      if (name === "create_goal" || name === "update_goal" || name === "get_goal") return "管理执行目标";
      if (name === "subagent" || name === "subagent_fork") return "委派子任务 " + truncate(args.description || "", 40);
      if (name === "send_message") return "向子代理发送消息";
      if (name === "workflow") return "运行多代理工作流";
      if (name === "skill") return "加载技能 " + truncate(args.name || "", 40);
      var first = Object.keys(args)[0];
      return name + (first ? " · " + first + "=" + truncate(String(args[first]), 40) : "");
    }

    function collectPathInto(list, name, argsRaw) {
      if (!FILE_TOOLS[name]) return;
      var args = parseArgs(argsRaw);
      var path = args.path || args.file || args.filename || args.pattern;
      if (typeof path === "string" && path && list.indexOf(path) === -1) list.push(path);
    }

    // ───────────────────────── interpreter (rules-based) ─────────────────────────

    function blankRound() {
      return {
        userText: "", supplement: false, auto: false, turn: null,
        fileList: [], actions: [], errors: [], notes: [], replies: [], reasoning: []
      };
    }

    /**
     * Build the per-user-turn interpretation from ConversationNode[].
     * A round starts at every `user` (or mid-turn `steering`) message and
     * owns every assistant/tool node until the next one.
     */
    function interpret(nodes) {
      var stats = { rounds: 0, user: 0, assistant: 0, toolCalls: 0, errors: 0, toolTypes: {}, files: [] };
      var rounds = [];
      var cur = null;

      function ensureRound() {
        if (!cur) { cur = blankRound(); cur.auto = true; rounds.push(cur); }
        return cur;
      }

      var sorted = (nodes || []).slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });

      sorted.forEach(function (node) {
        if (!node) return;
        switch (node.kind) {
          case "user": {
            cur = blankRound();
            cur.userText = nodeText(node);
            rounds.push(cur);
            stats.user++;
            break;
          }
          case "steering": {
            cur = blankRound();
            cur.userText = nodeText(node);
            cur.supplement = true;
            rounds.push(cur);
            stats.user++;
            break;
          }
          case "assistant": {
            ensureRound();
            stats.assistant++;
            var texts = [], reasons = [];
            (node.blocks || []).forEach(function (b) {
              if (!b) return;
              if (b.kind === "text") texts.push(b.text || "");
              else if (b.kind === "reasoning") reasons.push(b.text || "");
              else if (b.kind === "tool-call") {
                var act = { name: b.name, desc: toolCallText(b.name, b.argsRaw), cat: categoryFor(b.name, b.argsRaw), argsRaw: b.argsRaw };
                cur.actions.push(act);
                stats.toolCalls++;
                stats.toolTypes[b.name] = (stats.toolTypes[b.name] || 0) + 1;
                collectPathInto(stats.files, b.name, b.argsRaw);
                collectPathInto(cur.fileList, b.name, b.argsRaw);
              }
            });
            if (texts.join("").trim()) cur.replies.push(texts.join("\n").trim());
            if (reasons.length) cur.reasoning.push(reasons.join("\n").trim());
            if (cur.turn === null && typeof node.turn === "number") cur.turn = node.turn;
            break;
          }
          case "tool-result": {
            ensureRound();
            if (node.isError) {
              stats.errors++;
              cur.errors.push((node.call ? node.call.name : "工具") +
                (node.error && node.error.code ? " [" + node.error.code + "]" : "") +
                (node.error && node.error.name ? " · " + node.error.name : ""));
            }
            break;
          }
          case "turn-error": {
            ensureRound();
            stats.errors++;
            cur.errors.push(node.message || "回合错误");
            break;
          }
          case "turn-max-tokens": {
            ensureRound();
            cur.notes.push("本轮输出达到长度上限，结果可能被截断");
            break;
          }
          case "compaction": {
            ensureRound();
            cur.notes.push("此前的历史已压缩（checkpoint）");
            break;
          }
          case "model-retry": {
            ensureRound();
            cur.notes.push("模型请求重试");
            break;
          }
          case "command": {
            ensureRound();
            var label = "斜杠命令 /" + (node.name || "?") + (node.args ? " " + truncate(node.args, 40) : "");
            cur.actions.push({ name: "command", desc: label, cat: "other", argsRaw: "" });
            stats.toolCalls++;
            stats.toolTypes.command = (stats.toolTypes.command || 0) + 1;
            if (node.outcome && node.outcome.kind === "error") {
              stats.errors++;
              cur.errors.push(label + " 执行失败");
            }
            break;
          }
          case "context": {
            var c = nodeText(node);
            if (c) { ensureRound(); cur.notes.push("上下文注入：" + truncate(c, 60)); }
            break;
          }
          default:
            break;
        }
      });

      // Post-process: derive per-round summaries.
      rounds.forEach(function (r) {
        r.demand = condense(stripNoise(r.userText), 80, 2);
        r.replyAll = r.replies.join("\n\n");
        r.replyGist = condense(stripNoise(r.replyAll), 140, 2);
        r.files = r.fileList;
        r.categories = summarizeCategories(r.actions);
      });

      // Drop info-only auto rounds (e.g. bare context injections before the first message).
      rounds = rounds.filter(function (r) {
        return !r.auto || r.actions.length > 0 || r.errors.length > 0 || r.replies.length > 0;
      });
      rounds.forEach(function (r, i) { r.index = i + 1; });
      stats.rounds = rounds.length;
      return { stats: stats, rounds: rounds };
    }

    /** Group a round's actions into ordered phase summaries (规划/调研/实现/…). */
    function summarizeCategories(actions) {
      var map = {};
      (actions || []).forEach(function (a) {
        var c = map[a.cat] || (map[a.cat] = { cat: a.cat, label: CAT_LABEL[a.cat] || a.cat, count: 0, descs: [] });
        c.count++;
        if (c.descs.indexOf(a.desc) === -1 && c.descs.length < 6) c.descs.push(a.desc);
      });
      return Object.keys(map)
        .map(function (k) { return map[k]; })
        .sort(function (a, b) { return CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat); });
    }

    function categoryLine(c) {
      var shown = c.descs.slice(0, 4).join("；");
      if (c.descs.length > 4) shown += "；等更多";
      return shown;
    }

    // ───────────────────────── AI summary (server LLM route) ─────────────────────────

    var SUMMARIZE_URL = "/plugin-api/trajectory-reader/summarize";

    // 模型来源标签（服务端 route.source）：「session」= 对话界面选中的模型；「default」= 会话默认模型；「fallback」= 兜底模型
    var ROUTE_SOURCE_LABEL = { session: "会话模型", default: "默认模型", fallback: "兜底模型" };

    function cap(s, n) {
      s = String(s == null ? "" : s);
      return s.length > n ? s.slice(0, n - 1) + "…" : s;
    }

    /** Frame one round into the material the summarizer prompt consumes. */
    function buildRoundMaterial(r) {
      return {
        轮次: r.index,
        用户消息: cap(stripNoise(r.userText), 1500) || (r.auto ? "（会话开始，本轮没有用户消息）" : "（无文字内容）"),
        中途补充: !!r.supplement,
        助手回复: cap(stripNoise(r.replyAll), 3000),
        助手思考节选: cap(r.reasoning.join("\n"), 800),
        工具调用顺序: r.actions.slice(0, 80).map(function (a) { return { 工具: a.name, 说明: a.desc }; }),
        错误: r.errors.slice(0, 20),
        备注: r.notes.slice(0, 10)
      };
    }

    /** Cheap stable cache key over the framed material (djb2). */
    function materialKey(m) {
      var s = JSON.stringify(m), h = 5381;
      for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      return h.toString(36);
    }

    // ───────────────────────── view components ─────────────────────────

    function StatChip(props) {
      return jsx.jsx("span", { className: "tr-stat", children: [props.label, " ", jsx.jsx("b", { children: String(props.value) })] });
    }

    /** Live "已耗时 Ns" companion for the pending AI card. */
    function Elapsed(props) {
      var startedAt = props.startedAt || Date.now();
      var tick = React.useState(0);
      var setTick = tick[1];
      React.useEffect(function () {
        var t = setInterval(function () { setTick(function (n) { return n + 1; }); }, 1000);
        return function () { clearInterval(t); };
      }, []);
      var s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      return jsx.jsx("span", { children: "，已耗时 " + s + " 秒" });
    }

    /** Markdown-lite renderer for the AI narrative (### headings + plain lines). */
    function AiText(props) {
      var lines = String(props.text || "").split("\n");
      return jsx.jsx("div", { className: "tr-ai-text", children: lines.map(function (line, i) {
        if (/^#{1,6}\s+/.test(line)) {
          return jsx.jsx("span", { className: "tr-ai-h", children: line.replace(/^#{1,6}\s+/, "") }, "h-" + i);
        }
        return jsx.jsx("span", { children: [line, i < lines.length - 1 ? "\n" : ""] }, "l-" + i);
      }) });
    }

    function RoundCard(props) {
      var r = props.round;
      var ai = props.ai; // { status: idle|loading|done|error, text?, error?, route? }
      var available = props.available;
      var busy = ai && ai.status === "loading";
      return jsx.jsx("div", { className: "tr-turn", children: [
        jsx.jsx("div", { className: "tr-turn-head", children: [
          jsx.jsx("span", { className: "tr-turn-num", children: "第 " + r.index + " 轮" }),
          r.auto && jsx.jsx("span", { children: "· 会话初始（无用户消息）" }),
          r.supplement && jsx.jsx("span", { children: "· 用户补充需求" }),
          r.actions.length > 0 && jsx.jsx("span", { children: "· 工具 " + r.actions.length + " 次" }),
          r.files.length > 0 && jsx.jsx("span", { children: "· 文件 " + r.files.length + " 个" }),
          r.errors.length > 0 && jsx.jsx("span", { className: "tr-err-n", children: "· 错误 " + r.errors.length + " 处" }),
          available !== false && jsx.jsx("button", {
            className: "tr-btn tr-btn-head",
            disabled: busy,
            onClick: props.onSummarize,
            children: busy ? "⏳ AI 解读中…" : (ai && ai.status === "done" ? "✨ 重新解读" : "✨ AI 解读本轮")
          })
        ] }),

        ai && ai.status === "loading" && jsx.jsx("div", { className: "tr-ai tr-ai-pending", children: [
          jsx.jsx("span", { className: "tr-ai-label", children: "🧠 AI 过程解读" }),
          jsx.jsx("div", { className: "tr-ai-status", children: [
            "正在调用模型，梳理这一轮的思考与执行过程…（约需 20–60 秒，请稍候",
            jsx.jsx(Elapsed, { startedAt: ai.startedAt }),
            "）"
          ] })
        ] }),

        ai && ai.status === "error" && jsx.jsx("div", { className: "tr-ai", children: [
          jsx.jsx("span", { className: "tr-ai-label", children: "🧠 AI 过程解读" }),
          jsx.jsx("div", { className: "tr-ai-err", children: ["生成失败：" + ai.error + "\n可点击右上角按钮重试；若反复失败，请刷新页面（⌘R）后重试。"] })
        ] }),

        ai && ai.status === "done" && jsx.jsx("div", { className: "tr-ai", children: [
          jsx.jsx("span", { className: "tr-ai-label", children: ["🧠 AI 过程解读", jsx.jsx("span", { className: "tr-ai-route", children: "（" + (ai.route || "模型") + (ai.routeSource ? " · " + (ROUTE_SOURCE_LABEL[ai.routeSource] || ai.routeSource) : "") + " 生成）" })] }),
          jsx.jsx(AiText, { text: ai.text })
        ] }),

        !r.auto && jsx.jsx("div", { className: "tr-demand", children: [
          jsx.jsx("span", { className: "tr-demand-label", children: "🎯 用户需求" }),
          jsx.jsx("div", { className: "tr-demand-text", children: r.demand || "（无文字内容，可能仅附件）" }),
          r.userText && r.userText !== r.demand &&
            jsx.jsx("details", { className: "tr-details", style: { margin: "8px 0 0" }, children: [
              jsx.jsx("summary", { children: "查看需求原文" }),
              jsx.jsx("div", { className: "tr-orig", children: r.userText })
            ] })
        ] }),

        jsx.jsx("div", { className: "tr-how", children: [
          jsx.jsx("span", { className: "tr-how-label", children: "🛠 助手如何完成" }),
          r.categories.length === 0 && r.errors.length === 0 && !r.replyGist &&
            jsx.jsx("div", { className: "tr-none", children: "（本轮暂无助手活动，可能仍在进行中）" }),
          r.categories.length > 0 && jsx.jsx("div", { className: "tr-phase", children:
            r.categories.map(function (c, i) {
              return jsx.jsx("span", { className: "tr-phase-chip", children: c.label + " " + c.count }, "pc-" + i);
            })
          }),
          r.categories.map(function (c, i) {
            return jsx.jsx("div", { className: "tr-bullet", children: [
              jsx.jsx("span", { className: "tr-k", children: c.label + "（" + c.count + " 次）：" }),
              categoryLine(c)
            ] }, "cat-" + i);
          }),
          r.errors.map(function (err, i) {
            return jsx.jsx("div", { className: "tr-errors", children: "⚠ " + err }, "err-" + i);
          }),
          r.notes.map(function (n, i) {
            return jsx.jsx("div", { className: "tr-context", children: "· " + n }, "note-" + i);
          })
        ] }),

        r.replyAll && jsx.jsx("div", { className: "tr-reply", children: [
          jsx.jsx("span", { className: "tr-reply-label", children: "💬 助手回复（摘要）" }),
          jsx.jsx("div", { className: "tr-reply-text", children: r.replyGist || "（见完整回复）" }),
          r.replyAll !== r.replyGist &&
            jsx.jsx("details", { className: "tr-details", style: { margin: "8px 0 0" }, children: [
              jsx.jsx("summary", { children: "查看完整回复" }),
              jsx.jsx("div", { className: "tr-orig", children: r.replyAll })
            ] })
        ] }),

        r.actions.length > 0 && jsx.jsx("details", { className: "tr-details", children: [
          jsx.jsx("summary", { children: "操作明细（" + r.actions.length + " 次工具调用）" }),
          jsx.jsx("div", { className: "tr-tools", children:
            r.actions.map(function (a, i) {
              return jsx.jsx("div", { className: "tr-tool", children: [
                jsx.jsx("span", { className: "tr-tool-name", children: a.name }),
                jsx.jsx("span", { className: "tr-tool-args", children: a.desc })
              ] }, "op-" + i);
            })
          })
        ] })
      ] });
    }

    function TrajectoryReaderView(props) {
      var useSession = props.useSession;
      var nodes = [];
      try {
        if (typeof useSession === "function") nodes = useSession(function (snap) { return (snap && snap.nodes) || []; }) || [];
      } catch (e) { /* snapshot not ready */ }
      var interp = React.useMemo(function () { return interpret(nodes); }, [nodes]);
      var stats = interp.stats;
      var rounds = interp.rounds;

      // AI summary state: cache-key → { status, text?, error?, route? }.
      var aiState = React.useState({});
      var aiMap = aiState[0];
      var setAiMap = aiState[1];
      var availState = React.useState(null); // null=probing, true/false
      var available = availState[0];
      var setAvailable = availState[1];

      React.useEffect(function () {
        var alive = true;
        fetch(SUMMARIZE_URL, { method: "GET" })
          .then(function (res) { return res.ok; })
          .catch(function () { return false; })
          .then(function (ok) { if (alive) setAvailable(ok); });
        return function () { alive = false; };
      }, []);

      // Stable per-round cache keys: recompute only when rounds change.
      var keys = React.useMemo(function () {
        return rounds.map(function (r) { return materialKey(buildRoundMaterial(r)); });
      }, [rounds]);

      function applyResults(route, results) {
        setAiMap(function (prev) {
          var next = Object.assign({}, prev);
          (results || []).forEach(function (res) {
            next[res.key] = res.ok
              ? { status: "done", text: res.text, route: route.provider + "/" + route.model, routeSource: route.source || "?" }
              : { status: "error", error: res.error || "未知错误" };
          });
          return next;
        });
      }

      async function summarize(keyList, roundList) {
        // Everything below is wrapped so a click can NEVER be silent: any
        // failure lands in the visible error card instead of dying in the
        // handler (where React would swallow it and look like a dead button).
        try {
          var pending = [];
          keyList.forEach(function (k, i) {
            var cur = aiMap[k];
            if (!cur || cur.status === "error" || cur.status === "idle") pending.push({ key: k, round: roundList[i] });
          });
          if (pending.length === 0) return;
          setAiMap(function (prev) {
            var next = Object.assign({}, prev);
            pending.forEach(function (p) { next[p.key] = { status: "loading", startedAt: Date.now() }; });
            return next;
          });
          var body;
          try {
            var payload = { rounds: pending.slice(0, 12).map(function (p) {
              return { key: p.key, material: buildRoundMaterial(p.round) };
            }) };
            // 使用对话界面当前选择的模型（无则让服务端回退到默认）
            var sel = null;
            if (props.fetchSelectedModel) {
              sel = await props.fetchSelectedModel();
            } else if (props.getSelectedModel) {
              sel = props.getSelectedModel();
            } else {
              console.error("[trajectory-reader] 槽位 inject 未生效：props 中缺少 fetchSelectedModel/getSelectedModel（session=" + String(props.sessionId || "?") + "）");
            }
            if (sel && typeof sel.provider === "string" && typeof sel.model === "string") {
              payload.provider = sel.provider;
              payload.model = sel.model;
            } else {
              console.warn("[trajectory-reader] 未读取到会话模型，回退服务端默认模型（session=" + String(props.sessionId || "?") + "）");
            }
            if (props.sessionId) payload.sessionId = props.sessionId;
            body = JSON.stringify(payload);
          } catch (e) {
            throw new Error("构造解读材料失败：" + (e && e.message ? e.message : String(e)));
          }
          fetch(SUMMARIZE_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: body
          })
            .then(function (res) {
              if (!res.ok) throw new Error("HTTP " + res.status);
              return res.json();
            })
            .then(function (data) {
              if (!data || !data.ok) throw new Error(data && data.error || "服务返回异常");
              applyResults(data.route || { provider: "?", model: "?" }, data.results || []);
            })
            .catch(function (err) {
              setAiMap(function (prev) {
                var next = Object.assign({}, prev);
                pending.forEach(function (p) {
                  if (!next[p.key] || next[p.key].status === "loading") next[p.key] = { status: "error", error: err.message || String(err) };
                });
                return next;
              });
            });
        } catch (e) {
          var msg = e && e.message ? e.message : String(e);
          setAiMap(function (prev) {
            var next = Object.assign({}, prev);
            keyList.forEach(function (k) { next[k] = { status: "error", error: msg }; });
            return next;
          });
        }
      }

      function summarizeOne(i) {
        try { summarize([keys[i]], [rounds[i]]); }
        catch (e) { console.error("[trajectory-reader] click failed:", e); }
      }
      function summarizeAll() {
        try { summarize(keys, rounds); }
        catch (e) { console.error("[trajectory-reader] click failed:", e); }
      }

      return jsx.jsx("div", { className: "tr-root", children: [
        jsx.jsx("div", { className: "tr-head", children: [
          jsx.jsx("span", { className: "tr-title", children: "轨迹解读" }),
          jsx.jsx("span", { className: "tr-note", children: "按用户轮次逐轮总结：突出「用户需求」与「助手完成方式」" }),
          available && rounds.length > 0 && jsx.jsx("button", { className: "tr-btn", onClick: summarizeAll, children: "✨ AI 解读全部轮次" }),
          available === false && jsx.jsx("span", { className: "tr-ai-hint", children: "AI 解读未就绪（重启 GUI 后可用）" })
        ] }),
        jsx.jsx("div", { className: "tr-stats", children: [
          jsx.jsx(StatChip, { label: "需求轮次", value: stats.rounds }),
          jsx.jsx(StatChip, { label: "工具调用", value: stats.toolCalls }),
          jsx.jsx(StatChip, { label: "涉及文件", value: stats.files.length }),
          jsx.jsx(StatChip, { label: "错误", value: stats.errors })
        ] }),

        stats.rounds === 0
          ? jsx.jsx("div", { className: "tr-empty", children: "暂无轨迹数据" })
          : rounds.map(function (r, i) {
              return jsx.jsx(RoundCard, {
                round: r,
                ai: aiMap[keys[i]],
                available: available,
                onSummarize: function () { summarizeOne(i); }
              }, "round-" + r.index);
            }),
        jsx.jsx("div", { className: "tr-foot", children: "轨迹解读 · 规则总结即时生成；✨ AI 过程解读由 LLM 按轮生成，展示助手的思考与执行全过程" })
      ] });
    }

    // ───────────────────────── plugin ─────────────────────────

    var inject = ["slots", "connection", "modelDirectories"];

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.slots.inject("conversation.view", function () {
          return ctx.slots.register({
            name: "conversation.view",
            id: "trajectory-reader",
            order: 20,
            label: function () { return "轨迹解读"; },
            inject: function (sessionId) {
              // 快速路径：本地 modelDirectories store（与对话界面模型选择器同一共享状态）
              function syncFromDirectory() {
                try {
                  var dir = ctx.modelDirectories.directoryFor(sessionId);
                  var snap = dir && dir.store ? dir.store.getSnapshot() : null;
                  var cur = snap && snap.current;
                  if (cur && typeof cur.provider === "string" && typeof cur.model === "string") {
                    return { provider: cur.provider, model: cur.model };
                  }
                } catch (e) { /* 忽略：走宿主 RPC */ }
                return null;
              }
              return {
                getSelectedModel: syncFromDirectory,
                // 权威来源：宿主 session.models RPC（与对话界面模型选择器同一数据源），
                // 点击时异步取回当前会话选中的 provider/model，本地 store 未就绪也能拿到
                fetchSelectedModel: function () {
                  var fast = syncFromDirectory();
                  if (fast) return Promise.resolve(fast);
                  try {
                    var conn = ctx.connection;
                    if (conn && conn.api && conn.api.sessions && typeof conn.api.sessions.models === "function") {
                      return conn.api.sessions.models({ sessionId: sessionId })
                        .then(function (res) {
                          // 兼容 { result: { ok, value } } 与 { ok, value } 两种包装
                          var r = res && res.result ? res.result : res;
                          var cur = r && r.ok ? (r.value && r.value.current) : null;
                          if (cur && typeof cur.provider === "string" && typeof cur.model === "string") {
                            return { provider: cur.provider, model: cur.model };
                          }
                          return null;
                        })
                        .catch(function () { return null; });
                    }
                  } catch (e) { /* 忽略：回退服务端默认 */ }
                  return Promise.resolve(null);
                }
              };
            }
          }, TrajectoryReaderView);
        });
      }, "trajectory-reader: view tab");
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.interpret = interpret; // 供无头测试使用
    exports.buildRoundMaterial = buildRoundMaterial; // 供无头测试使用
    exports.materialKey = materialKey; // 供无头测试使用
    exports.SUMMARIZE_URL = SUMMARIZE_URL;
    return module.exports;
  }
});
