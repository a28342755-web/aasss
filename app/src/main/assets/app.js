"use strict";

const STORAGE_KEY = "aster-android-state-v1";
const $ = (selector) => document.querySelector(selector);
const elements = {
  conversation: $("#conversation"), welcome: $("#welcome"), form: $("#chatForm"), input: $("#messageInput"),
  send: $("#sendButton"), stop: $("#stopButton"), newChat: $("#newChatButton"), settingsButton: $("#settingsButton"),
  settings: $("#settingsPanel"), closeSettings: $("#closeSettings"), backdrop: $("#backdrop"), serverUrl: $("#serverUrl"),
  testConnection: $("#testConnection"), model: $("#modelInput"), modelList: $("#modelList"), modelSubtitle: $("#modelSubtitle"),
  systemPrompt: $("#systemPrompt"), temperature: $("#temperature"), temperatureValue: $("#temperatureValue"),
  maxTokens: $("#maxTokens"), statusDot: $("#statusDot"), statusText: $("#statusText")
};

let messages = [];
let isGenerating = false;
let assistantIndex = -1;

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function renderInline(text) {
  return text.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}
function renderMarkdown(source) {
  const escaped = escapeHtml(source);
  const blocks = [];
  const tokenized = escaped.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, language, code) => {
    const i = blocks.length; blocks.push({ language: language || "text", code: code.replace(/\n$/, "") }); return `\n@@CODE_${i}@@\n`;
  });
  const output = []; let list = null;
  const close = () => { if (list) { output.push(`</${list}>`); list = null; } };
  for (const line of tokenized.split("\n")) {
    const t = line.trim(); const code = t.match(/^@@CODE_(\d+)@@$/);
    if (code) { close(); const b = blocks[Number(code[1])]; output.push(`<div class="code-block"><div class="code-toolbar"><span>${b.language}</span><button type="button" data-code="${code[1]}">복사</button></div><pre><code>${b.code}</code></pre></div>`); continue; }
    if (!t) { close(); continue; }
    const h = t.match(/^(#{1,3})\s+(.+)$/); if (h) { close(); output.push(`<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`); continue; }
    const ul = t.match(/^[-*]\s+(.+)$/); if (ul) { if (list !== "ul") { close(); list = "ul"; output.push("<ul>"); } output.push(`<li>${renderInline(ul[1])}</li>`); continue; }
    const ol = t.match(/^\d+\.\s+(.+)$/); if (ol) { if (list !== "ol") { close(); list = "ol"; output.push("<ol>"); } output.push(`<li>${renderInline(ol[1])}</li>`); continue; }
    if (t.startsWith("&gt; ")) { close(); output.push(`<blockquote>${renderInline(t.slice(5))}</blockquote>`); continue; }
    close(); output.push(`<p>${renderInline(t)}</p>`);
  }
  close(); return { html: output.join("\n"), blocks };
}
function messageElement(message, index, streaming = false) {
  const article = document.createElement("article"); article.className = `message ${message.role}`; article.dataset.index = index;
  const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = message.role === "user" ? "나" : "A";
  const body = document.createElement("div"); const head = document.createElement("div"); head.className = "message-head"; head.innerHTML = `<span>${message.role === "user" ? "나" : "Aster"}</span>`;
  const copy = document.createElement("button"); copy.type = "button"; copy.className = "copy-button"; copy.textContent = "복사";
  copy.onclick = async () => { try { await navigator.clipboard.writeText(message.content); copy.textContent = "완료"; setTimeout(() => copy.textContent = "복사", 900); } catch {} };
  head.append(copy); const content = document.createElement("div"); content.className = "message-content" + (streaming ? " typing-caret" : "");
  if (message.role === "assistant") {
    const rendered = renderMarkdown(message.content); content.innerHTML = rendered.html || "<p></p>";
    content.querySelectorAll("[data-code]").forEach(button => button.onclick = async () => { const b = rendered.blocks[Number(button.dataset.code)]; try { await navigator.clipboard.writeText(b.code); button.textContent = "완료"; } catch {} });
  } else content.textContent = message.content;
  body.append(head, content); article.append(avatar, body); return article;
}
function renderConversation(streaming = -1) {
  elements.conversation.innerHTML = "";
  if (!messages.length) { elements.conversation.append(elements.welcome); bindSuggestions(); return; }
  messages.forEach((m, i) => elements.conversation.append(messageElement(m, i, i === streaming)));
}
function updateAssistant(streaming = true) {
  const old = elements.conversation.querySelector(`[data-index="${assistantIndex}"]`); const next = messageElement(messages[assistantIndex], assistantIndex, streaming);
  if (old) old.replaceWith(next); else elements.conversation.append(next);
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, serverUrl: elements.serverUrl.value, model: elements.model.value, systemPrompt: elements.systemPrompt.value, temperature: elements.temperature.value, maxTokens: elements.maxTokens.value }));
}
function load() {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); messages = Array.isArray(state.messages) ? state.messages : [];
    if (state.serverUrl) elements.serverUrl.value = state.serverUrl; if (state.model) elements.model.value = state.model;
    if (state.systemPrompt) elements.systemPrompt.value = state.systemPrompt; if (state.temperature) elements.temperature.value = state.temperature; if (state.maxTokens) elements.maxTokens.value = state.maxTokens;
  } catch { messages = []; }
  sync(); renderConversation();
}
function sync() { elements.temperatureValue.textContent = elements.temperature.value; elements.modelSubtitle.textContent = elements.model.value || "모델 미지정"; }
function resize() { elements.input.style.height = "auto"; elements.input.style.height = `${Math.min(elements.input.scrollHeight, 160)}px`; }
function setGenerating(value) { isGenerating = value; elements.send.classList.toggle("hidden", value); elements.stop.classList.toggle("hidden", !value); elements.input.disabled = value; }
function bottom() { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); }
function openSettings() { elements.settings.classList.add("open"); elements.backdrop.classList.add("open"); elements.settings.setAttribute("aria-hidden", "false"); }
function closeSettings() { elements.settings.classList.remove("open"); elements.backdrop.classList.remove("open"); elements.settings.setAttribute("aria-hidden", "true"); save(); }
window.__asterHandleBack = () => {
  if (elements.settings.classList.contains("open")) { closeSettings(); return true; }
  if (isGenerating) { if (window.AsterNative) window.AsterNative.cancelChat(); return true; }
  return false;
};
function bindSuggestions() { document.querySelectorAll("[data-prompt]").forEach(button => button.onclick = () => sendMessage(button.dataset.prompt)); }

function sendMessage(raw) {
  const text = raw.trim(); if (!text || isGenerating) return;
  if (!window.AsterNative) { alert("안드로이드 앱에서 실행해야 합니다."); return; }
  messages.push({ role: "user", content: text }); messages.push({ role: "assistant", content: "" }); assistantIndex = messages.length - 1;
  elements.input.value = ""; resize(); setGenerating(true); renderConversation(assistantIndex); bottom(); save();
  window.AsterNative.sendChat(JSON.stringify({ server_url: elements.serverUrl.value.trim(), messages: messages.slice(0, -1), model: elements.model.value.trim(), system_prompt: elements.systemPrompt.value, temperature: Number(elements.temperature.value), max_tokens: Number(elements.maxTokens.value) }));
}
window.__asterOnChunk = chunk => { if (assistantIndex < 0) return; messages[assistantIndex].content += chunk; updateAssistant(true); bottom(); };
window.__asterOnDone = cancelled => { if (assistantIndex >= 0 && !messages[assistantIndex].content.trim()) messages[assistantIndex].content = cancelled ? "생성이 중지되었습니다." : "모델이 빈 응답을 반환했습니다."; finish(); };
window.__asterOnError = error => { if (assistantIndex >= 0) messages[assistantIndex].content = `연결 오류: ${error}\n\n설정에서 PC의 Ollama 주소와 방화벽을 확인하세요.`; finish(); };
function finish() { if (assistantIndex >= 0) updateAssistant(false); setGenerating(false); save(); assistantIndex = -1; elements.input.disabled = false; elements.input.focus(); }
window.__asterHealthResult = raw => {
  let data; try { data = JSON.parse(raw); } catch { data = { ok: false, error: "응답 해석 실패" }; }
  elements.statusDot.className = "status-dot " + (data.ok ? "ok" : "error");
  elements.statusText.textContent = data.ok ? `연결됨 · 모델 ${data.models.length}개` : `연결 실패 · ${data.error || "주소를 확인하세요"}`;
  elements.modelList.innerHTML = ""; if (data.ok) data.models.forEach(name => { const o = document.createElement("option"); o.value = name; elements.modelList.append(o); });
};

elements.form.onsubmit = event => { event.preventDefault(); sendMessage(elements.input.value); };
elements.input.oninput = resize;
elements.input.onkeydown = event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(elements.input.value); } };
elements.stop.onclick = () => { if (window.AsterNative) window.AsterNative.cancelChat(); };
// generating stays on until the cancelled stream's __asterOnDone arrives, so a new send cannot overlap the old stream
elements.newChat.onclick = () => { if (isGenerating && window.AsterNative) window.AsterNative.cancelChat(); messages = []; assistantIndex = -1; save(); renderConversation(); };
elements.settingsButton.onclick = openSettings; elements.closeSettings.onclick = closeSettings; elements.backdrop.onclick = closeSettings;
elements.testConnection.onclick = () => { elements.statusDot.className = "status-dot"; elements.statusText.textContent = "연결 확인 중…"; save(); if (window.AsterNative) window.AsterNative.checkHealth(elements.serverUrl.value.trim()); };
[elements.serverUrl, elements.model, elements.systemPrompt, elements.temperature, elements.maxTokens].forEach(control => control.oninput = () => { sync(); save(); });

const hadSavedState = !!localStorage.getItem(STORAGE_KEY);
load(); resize();
if (!hadSavedState) setTimeout(openSettings, 350);
