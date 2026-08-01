import type { BatchSummary, InviteSummary, SessionSummary } from "../store.js";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageShell(title: string, nonce: string, body: string, script = ""): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(title)}</title>
  <style nonce="${escapeHtml(nonce)}">
    :root{color-scheme:dark;font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;background:#0d0c0a;color:#f0eadf}
    *{box-sizing:border-box;letter-spacing:0}[hidden]{display:none!important}body{margin:0;min-height:100vh;background:#0d0c0a}
    button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #e2a14b;outline-offset:3px}
    .shell{width:min(calc(100% - 32px),960px);margin:0 auto}.eyebrow{font-size:12px;letter-spacing:.14em;color:#b8a98f;text-transform:uppercase}
    .muted{color:#a59d91}.error{margin:18px 0 0;padding:12px 14px;border-left:3px solid #d56b4e;background:#21130f;color:#ffd8cc}
    .button{min-height:44px;border:1px solid #d9973e;background:#d9973e;color:#17120b;padding:0 18px;font-weight:700}
    .button:hover{background:#e8aa59}.button.secondary{border-color:#5f584d;background:transparent;color:#e8e0d5}.button.danger{border-color:#984f42;background:transparent;color:#ffc3b7}
  </style>
</head>
<body>${body}${script ? `<script nonce="${escapeHtml(nonce)}">${script}</script>` : ""}</body>
</html>`;
}

export function renderAccessPage(options: {
  nonce: string;
  formNonce: string;
  error?: string;
}): string {
  const error = options.error
    ? `<p class="error" role="alert">${escapeHtml(options.error)}</p>`
    : "";
  const body = `<main class="shell access">
  <section class="gate" aria-labelledby="gate-title">
    <p class="eyebrow">FilmFrame · Private Darkroom</p>
    <h1 id="gate-title">凭一枚暗房邀请，进入这一卷</h1>
    <p class="intro">输入邀请码后，照片仍只在你的浏览器中处理，不会上传到门禁服务。</p>
    <form method="post" action="/auth/redeem" autocomplete="off">
      <input type="hidden" name="nonce" value="${escapeHtml(options.formNonce)}">
      <label for="invite-code">邀请码</label>
      <div class="field-row">
        <input id="invite-code" name="code" type="text" inputmode="text" autocapitalize="characters" spellcheck="false" maxlength="128" required placeholder="FF1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX">
        <button class="button" type="submit">进入暗房</button>
      </div>
    </form>${error}
  </section>
</main>
<style nonce="${escapeHtml(options.nonce)}">
  .access{min-height:100vh;display:grid;place-items:center;padding:48px 0}.gate{width:min(100%,660px);border-top:1px solid #4c4438;border-bottom:1px solid #4c4438;padding:54px 0}
  h1{margin:12px 0 14px;font-family:"Songti SC","STSong",serif;font-size:clamp(30px,6vw,52px);font-weight:500;line-height:1.2}.intro{max-width:540px;margin:0 0 36px;color:#bcb3a5;line-height:1.8}
  label{display:block;margin:0 0 9px;font-size:13px;color:#c9beae}.field-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}
  input{width:100%;min-height:48px;border:1px solid #5b5347;border-radius:0;background:#15130f;color:#fff;padding:0 14px;text-transform:uppercase}
  @media(max-width:520px){.access{align-items:start;padding-top:18vh}.gate{padding:36px 0}.field-row{grid-template-columns:1fr}.button{width:100%}}
</style>`;
  return pageShell("进入 FilmFrame", options.nonce, body);
}

const statusLabel: Record<InviteSummary["status"], string> = {
  active: "待兑换",
  redeemed: "已兑换",
  expired: "已过期",
  revoked: "已撤销",
};

function formatDate(timestamp: number | null): string {
  if (timestamp === null) return "—";
  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function inviteRows(invites: readonly InviteSummary[]): string {
  if (invites.length === 0) {
    return `<tr class="empty-row"><td colspan="7" class="empty">尚未生成邀请码</td></tr>`;
  }
  return invites
    .map(
      (invite) => `<tr data-record-id="${escapeHtml(invite.id)}" data-status="${invite.status}" data-batch-id="${escapeHtml(invite.batchId ?? "standalone")}" data-search="${escapeHtml(`${invite.label} ${invite.id} ${invite.batchName ?? "历史单码"}`.toLowerCase())}">
  <td data-label="备注 / ID"><strong>${escapeHtml(invite.label)}</strong><small>${escapeHtml(invite.id)}</small></td>
  <td data-label="批次">${invite.batchName ? `<strong>${escapeHtml(invite.batchName)}</strong><small>#${String(invite.batchPosition).padStart(2, "0")}</small>` : "历史单码"}</td>
  <td class="record-status" data-label="状态"><span class="status ${invite.status}">${statusLabel[invite.status]}</span></td>
  <td data-label="创建时间">${formatDate(invite.createdAt)}</td>
  <td data-label="兑换截止">${formatDate(invite.redeemBy)}</td>
  <td data-label="最近兑换">${formatDate(invite.lastRedeemedAt)}</td>
  <td data-label="操作"><button class="button danger revoke" type="button" data-id="${escapeHtml(invite.id)}" ${invite.status === "revoked" ? "disabled" : ""}>撤销</button></td>
</tr>`,
    )
    .join("");
}

function batchRows(batches: readonly BatchSummary[]): string {
  if (batches.length === 0) {
    return `<tr class="empty-row"><td colspan="5" class="empty">尚无批次</td></tr>`;
  }
  return batches.map((batch) => `<tr data-batch-record="${escapeHtml(batch.id)}">
  <td data-label="批次"><strong>${escapeHtml(batch.name)}</strong><small>${escapeHtml(batch.id)}</small></td>
  <td data-label="邀请码">${batch.inviteCount}</td>
  <td data-label="有效设备" class="batch-sessions">${batch.activeSessionCount}</td>
  <td data-label="创建时间">${formatDate(batch.createdAt)}</td>
  <td data-label="操作"><button class="button danger revoke-batch" type="button" data-id="${escapeHtml(batch.id)}" data-name="${escapeHtml(batch.name)}" data-count="${batch.inviteCount}" data-sessions="${batch.activeSessionCount}" ${batch.revokedAt === null ? "" : "disabled"}>${batch.revokedAt === null ? "撤销整批" : "已撤销"}</button></td>
</tr>`).join("");
}

const sessionStatusLabel: Record<SessionSummary["status"], string> = {
  active: "有效",
  expired: "已过期",
  revoked: "已撤销",
};

function sessionRows(sessions: readonly SessionSummary[]): string {
  if (sessions.length === 0) {
    return `<tr class="empty-row"><td colspan="7" class="empty">尚无设备会话</td></tr>`;
  }
  return sessions
    .map(
      (session) => `<tr data-record-id="${escapeHtml(session.id)}" data-invite-id="${escapeHtml(session.inviteId)}">
  <td data-label="邀请"><strong>${escapeHtml(session.inviteLabel)}</strong><small>${escapeHtml(session.inviteId)}</small></td>
  <td data-label="会话 ID"><small class="standalone-id">${escapeHtml(session.id)}</small></td>
  <td class="record-status" data-label="状态"><span class="status ${session.status}">${sessionStatusLabel[session.status]}</span></td>
  <td data-label="创建时间">${formatDate(session.createdAt)}</td>
  <td data-label="最近使用">${formatDate(session.lastSeenAt)}</td>
  <td data-label="到期时间">${formatDate(session.expiresAt)}</td>
  <td data-label="操作"><button class="button danger revoke-session" type="button" data-id="${escapeHtml(session.id)}" ${session.status === "revoked" ? "disabled" : ""}>撤销会话</button></td>
</tr>`,
    )
    .join("");
}

export function renderAdminPage(options: {
  nonce: string;
  invites: readonly InviteSummary[];
  batches: readonly BatchSummary[];
  sessions: readonly SessionSummary[];
}): string {
  const body = `<main class="shell admin">
  <header><div><p class="eyebrow">FilmFrame Access</p><h1>暗房邀请管理</h1></div><p class="policy">固定策略：7 天内兑换 · 单次使用 · 本设备长期使用</p></header>
  <section class="create" aria-labelledby="create-title">
    <div><h2 id="create-title">生成邀请码</h2><p class="muted">邀请码明文只显示一次，请立即复制或下载。</p></div>
    <form id="create-form"><div class="mode-row"><label><input type="radio" name="create-mode" value="single" checked> 单个</label><label><input type="radio" name="create-mode" value="batch"> 批量</label></div><label for="label" id="name-label">备注</label><div class="create-row"><input id="label" maxlength="80" required placeholder="例如：七月访客"><input id="batch-count" type="number" min="1" max="50" value="10" hidden aria-label="生成数量"><button id="create-button" class="button" type="submit">生成</button></div></form>
  </section>
  <section id="one-time" class="one-time" hidden aria-live="polite"><div class="one-time-content"><p class="eyebrow">仅此一次</p><div id="created-codes" class="created-codes"></div></div><div class="one-time-actions"><button id="copy-code" class="button secondary" type="button">复制全部</button><button id="download-csv" class="button secondary" type="button">下载 CSV</button><button id="clear-code" class="button secondary" type="button">清除</button></div></section>
  <p id="admin-notice" class="notice" role="status" hidden></p>
  <p id="admin-error" class="error" role="alert" hidden></p>
  <section class="list" aria-labelledby="batch-list-title"><h2 id="batch-list-title">批次管理</h2><div class="table-wrap"><table><thead><tr><th>批次</th><th>邀请码</th><th>有效设备</th><th>创建时间</th><th>操作</th></tr></thead><tbody id="batch-list">${batchRows(options.batches)}</tbody></table></div></section>
  <section class="list" aria-labelledby="list-title"><div class="list-heading"><h2 id="list-title">邀请码记录</h2><div id="status-counters" class="counters"></div></div><div class="filters"><input id="invite-search" type="search" placeholder="搜索备注、ID 或批次"><select id="batch-filter" aria-label="批次筛选"><option value="all">全部批次</option><option value="standalone">历史单码</option>${options.batches.map((batch) => `<option value="${escapeHtml(batch.id)}">${escapeHtml(batch.name)}</option>`).join("")}</select><select id="status-filter" aria-label="状态筛选"><option value="all">全部状态</option><option value="active">待兑换</option><option value="redeemed">已兑换</option><option value="expired">已过期</option><option value="revoked">已撤销</option></select></div><div class="table-wrap"><table><thead><tr><th>备注 / ID</th><th>批次</th><th>状态</th><th>创建时间</th><th>兑换截止</th><th>最近兑换</th><th>操作</th></tr></thead><tbody id="invite-list">${inviteRows(options.invites)}</tbody></table></div></section>
  <section class="list" aria-labelledby="session-list-title"><h2 id="session-list-title">设备会话</h2><p class="muted list-intro">单独撤销只影响当前设备；撤销邀请码仍会终止该邀请下的全部设备会话。</p><div class="table-wrap"><table><thead><tr><th>邀请</th><th>会话 ID</th><th>状态</th><th>创建时间</th><th>最近使用</th><th>到期时间</th><th>操作</th></tr></thead><tbody id="session-list">${sessionRows(options.sessions)}</tbody></table></div></section>
</main>
<style nonce="${escapeHtml(options.nonce)}">
  .admin{padding:42px 0 64px}header{display:flex;align-items:end;justify-content:space-between;gap:24px;padding-bottom:26px;border-bottom:1px solid #423c33}h1{margin:7px 0 0;font:500 38px/1.2 "Songti SC","STSong",serif}h2{margin:0 0 6px;font-size:18px}.policy{margin:0;color:#b9ad99;font-size:13px}
  .create{display:grid;grid-template-columns:minmax(220px,1fr) minmax(320px,1.5fr);gap:36px;padding:30px 0}.create p{margin:0;font-size:13px}.create label{display:block;margin-bottom:8px;font-size:12px;color:#c8bdac}.mode-row{display:flex;gap:18px;margin-bottom:14px}.mode-row label{display:flex;align-items:center;gap:6px}.mode-row input{min-height:0}.create-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(82px,auto) auto;gap:8px}.create input,.create select,.filters input,.filters select{min-width:0;min-height:44px;border:1px solid #5c5448;border-radius:0;background:#15130f;color:#fff;padding:0 12px}.create-row input[hidden]{display:none}
  .one-time{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px;border:1px solid #b77b31;background:#19140d}.one-time-content{min-width:0;flex:1}.one-time p{margin:0 0 8px}.created-codes{max-height:240px;overflow:auto;font:13px/1.7 ui-monospace,SFMono-Regular,monospace;color:#ffd69e}.created-code-row{display:grid;grid-template-columns:1fr auto;gap:16px;border-bottom:1px solid #3b2c1a;padding:4px 0}.one-time-actions{display:flex;flex-wrap:wrap;gap:8px}
  .notice{margin:18px 0 0;padding:12px 14px;border-left:3px solid #b77b31;background:#19140d;color:#f2d2a4}.list{padding-top:34px}.list-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.counters{display:flex;gap:10px;color:#a99f91;font-size:12px}.filters{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:8px;margin:14px 0}.list-intro{margin:0 0 14px;font-size:12px;line-height:1.6}.table-wrap{overflow-x:auto;border-top:1px solid #423c33}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:14px 10px;border-bottom:1px solid #302c26;vertical-align:middle}th{color:#a99f91;font-weight:500}td small{display:block;margin-top:5px;color:#797269;font-size:10px}.standalone-id{max-width:150px;overflow-wrap:anywhere}.status{display:inline-block;padding:4px 7px;border-left:2px solid #777}.status.active{border-color:#d99b47;color:#f0c27d}.status.redeemed{border-color:#668773;color:#9ac4aa}.status.expired{color:#8c857b}.status.revoked{border-color:#9f5448;color:#d89a8f}.revoke,.revoke-session,.revoke-batch{min-height:34px;padding:0 10px;font-size:12px}.button:disabled{cursor:not-allowed;opacity:.45}.empty{text-align:center;color:#8e877c;padding:36px}.error{margin-bottom:0}
  @media(max-width:700px){.admin{padding-top:26px}header{display:block}.policy{margin-top:16px}.create{grid-template-columns:1fr;gap:18px}.create-row{grid-template-columns:1fr 88px}.create-row .button{grid-column:1/-1}.one-time{align-items:stretch;flex-direction:column}.one-time-actions{display:grid;grid-template-columns:1fr}.one-time .button{width:100%}.filters{grid-template-columns:1fr}.list-heading{align-items:flex-start;flex-direction:column}table,thead,tbody,tr,th,td{display:block}thead{position:absolute;clip:rect(0 0 0 0)}tr{padding:12px 0;border-bottom:1px solid #302c26}td{display:grid;grid-template-columns:88px minmax(0,1fr);align-items:center;gap:14px;border:0;padding:7px 0;overflow-wrap:anywhere}td::before{content:attr(data-label);color:#8f8678;font-size:11px;font-weight:500}.revoke,.revoke-session,.revoke-batch{width:100%}}
</style>`;

  const script = `
const csrfHeaders={"Content-Type":"application/json","X-FilmFrame-CSRF":"1"};
const byId=(id)=>document.getElementById(id);
const errorBox=byId("admin-error"),noticeBox=byId("admin-notice"),createForm=byId("create-form"),createButton=byId("create-button"),inviteList=byId("invite-list"),batchList=byId("batch-list"),sessionList=byId("session-list");
const inviteStatusLabels={active:"待兑换",redeemed:"已兑换",expired:"已过期",revoked:"已撤销"};
const sessionStatusLabels={active:"有效",expired:"已过期",revoked:"已撤销"};
let createBusy=false,createAttempt=null,freshCodes=[];
function clearFeedback(){errorBox.hidden=true;noticeBox.hidden=true}
function showError(message){noticeBox.hidden=true;errorBox.textContent=message;errorBox.hidden=false}
function showNotice(message){errorBox.hidden=true;noticeBox.textContent=message;noticeBox.hidden=false}
function clearCreatedCodes(){freshCodes=[];byId("created-codes").replaceChildren();byId("one-time").hidden=true;byId("copy-code").textContent="复制全部"}
function displayDate(value){return typeof value==="string"&&value.length>=16?value.replace("T"," ").slice(0,16)+" UTC":"—"}
function appendTextCell(row,label,primary,secondary){const cell=document.createElement("td");cell.dataset.label=label;const strong=document.createElement("strong");strong.textContent=primary;cell.appendChild(strong);if(secondary){const small=document.createElement("small");small.textContent=secondary;cell.appendChild(small)}row.appendChild(cell);return cell}
function appendPlainCell(row,label,value,className){const cell=document.createElement("td");cell.dataset.label=label;if(className)cell.className=className;cell.textContent=value;row.appendChild(cell);return cell}
function setStatus(cell,status,labels){const safe=Object.hasOwn(labels,status)?status:"expired";const badge=document.createElement("span");badge.className="status "+safe;badge.textContent=labels[safe];cell.replaceChildren(badge)}
function removeEmptyRow(list){list.querySelector(".empty-row")?.remove()}
function createRevokeButton(kind,id,disabled){const button=document.createElement("button");button.type="button";button.className="button danger "+(kind==="invite"?"revoke":"revoke-session");button.dataset.id=id;button.disabled=disabled;button.textContent=kind==="invite"?"撤销":"撤销会话";return button}
function inviteRow(invite){if(!invite||typeof invite.id!=="string"||typeof invite.label!=="string")throw new Error("invalid response");const status=Object.hasOwn(inviteStatusLabels,invite.status)?invite.status:"expired";const row=document.createElement("tr");row.dataset.recordId=invite.id;row.dataset.status=status;row.dataset.batchId=invite.batchId||"standalone";row.dataset.search=(invite.label+" "+invite.id+" "+(invite.batchName||"历史单码")).toLowerCase();appendTextCell(row,"备注 / ID",invite.label,invite.id);appendTextCell(row,"批次",invite.batchName||"历史单码",invite.batchPosition?"#"+String(invite.batchPosition).padStart(2,"0"):"");const statusCell=appendPlainCell(row,"状态","","record-status");setStatus(statusCell,status,inviteStatusLabels);appendPlainCell(row,"创建时间",displayDate(invite.createdAt));appendPlainCell(row,"兑换截止",displayDate(invite.redeemBy));appendPlainCell(row,"最近兑换",displayDate(invite.lastRedeemedAt));const action=appendPlainCell(row,"操作","");action.appendChild(createRevokeButton("invite",invite.id,status==="revoked"));return row}
function upsertInvite(invite){const old=Array.from(inviteList.querySelectorAll("tr[data-record-id]")).find((row)=>row.dataset.recordId===invite.id);const row=inviteRow(invite);if(old)old.replaceWith(row);else{removeEmptyRow(inviteList);inviteList.prepend(row)}applyFilters()}
function upsertBatch(batch){if(!batch||typeof batch.id!=="string")throw new Error("invalid response");removeEmptyRow(batchList);let row=Array.from(batchList.querySelectorAll("tr[data-batch-record]")).find((item)=>item.dataset.batchRecord===batch.id);if(!row){row=document.createElement("tr");row.dataset.batchRecord=batch.id;appendTextCell(row,"批次",batch.name,batch.id);appendPlainCell(row,"邀请码",String(batch.inviteCount));appendPlainCell(row,"有效设备",String(batch.activeSessionCount||0),"batch-sessions");appendPlainCell(row,"创建时间",displayDate(batch.createdAt));const action=appendPlainCell(row,"操作","");const button=document.createElement("button");button.type="button";button.className="button danger revoke-batch";button.dataset.id=batch.id;button.dataset.name=batch.name;button.dataset.count=String(batch.inviteCount);button.dataset.sessions=String(batch.activeSessionCount||0);button.disabled=batch.status==="revoked";button.textContent=button.disabled?"已撤销":"撤销整批";action.appendChild(button);batchList.prepend(row);const option=document.createElement("option");option.value=batch.id;option.textContent=batch.name;byId("batch-filter").appendChild(option)}}
function displayFresh(items){freshCodes=items.map((item)=>({code:item.code,label:item.invite.label,batchName:item.invite.batchName||""}));const root=byId("created-codes");root.replaceChildren();for(const item of freshCodes){const row=document.createElement("div");row.className="created-code-row";const code=document.createElement("code");code.textContent=item.code;const label=document.createElement("span");label.textContent=item.label;row.append(code,label);root.appendChild(row)}byId("one-time").hidden=false}
function markSessionRevoked(row){setStatus(row.querySelector(".record-status"),"revoked",sessionStatusLabels);const button=row.querySelector(".revoke-session");if(button)button.disabled=true}
function updateCounters(){const counts={active:0,redeemed:0,expired:0,revoked:0};inviteList.querySelectorAll("tr[data-record-id]").forEach((row)=>{if(!row.hidden&&Object.hasOwn(counts,row.dataset.status))counts[row.dataset.status]+=1});byId("status-counters").textContent="待兑换 "+counts.active+" · 已兑换 "+counts.redeemed+" · 已过期 "+counts.expired+" · 已撤销 "+counts.revoked}
function applyFilters(){const keyword=byId("invite-search").value.trim().toLowerCase(),batch=byId("batch-filter").value,status=byId("status-filter").value;inviteList.querySelectorAll("tr[data-record-id]").forEach((row)=>{row.hidden=Boolean(keyword&&!row.dataset.search.includes(keyword))||Boolean(batch!=="all"&&row.dataset.batchId!==batch)||Boolean(status!=="all"&&row.dataset.status!==status)});updateCounters()}
document.querySelectorAll('input[name="create-mode"]').forEach((radio)=>radio.addEventListener("change",()=>{const batch=radio.checked&&radio.value==="batch";if(radio.checked){byId("batch-count").hidden=!batch;byId("name-label").textContent=batch?"批次名称":"备注";byId("label").maxLength=batch?64:80;byId("label").placeholder=batch?"例如：八月体验用户":"例如：七月访客";createAttempt=null}}));
createForm.addEventListener("submit",async(event)=>{event.preventDefault();if(createBusy)return;clearFeedback();const mode=document.querySelector('input[name="create-mode"]:checked').value,name=byId("label").value.trim(),count=Number(byId("batch-count").value),signature=mode+"|"+name+"|"+(mode==="batch"?count:1);if(!createAttempt||createAttempt.signature!==signature)createAttempt={signature,key:crypto.randomUUID()};createBusy=true;createButton.disabled=true;createButton.textContent="生成中…";try{const headers={...csrfHeaders,"Idempotency-Key":createAttempt.key},url=mode==="batch"?"/api/invite-batches":"/api/invites",body=mode==="batch"?{name,count}:{label:name};const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(body)});if(response.status===409){createAttempt=null;throw new Error("conflict")}if(!response.ok)throw new Error("request");const result=await response.json();if(mode==="batch"){upsertBatch(result.batch);const invites=result.replayed?result.invites:result.codes.map((entry)=>entry.invite);invites.forEach(upsertInvite);if(result.replayed)clearCreatedCodes();else displayFresh(result.codes)}else{upsertInvite(result.invite);if(result.replayed)clearCreatedCodes();else displayFresh([{code:result.code,invite:result.invite}])}showNotice(result.replayed?"该请求已处理，邀请码明文不可恢复。如未保存，请撤销后重新生成。":"邀请码已生成，请立即复制或下载；离开页面后无法恢复。");byId("label").value="";createAttempt=null}catch{showError("生成结果未确认。请保持输入不变后重试，系统不会重复创建邀请码。")}finally{createBusy=false;createButton.disabled=false;createButton.textContent="生成"}});
byId("copy-code").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(freshCodes.map((item)=>item.code).join("\\n"));byId("copy-code").textContent="已复制"}catch{showError("自动复制失败，请手动选择邀请码。")}});
function csvCell(value){let safe=String(value);if(/^[=+\\-@]/.test(safe))safe="'"+safe;return '"'+safe.replaceAll('"','""')+'"'}
byId("download-csv").addEventListener("click",()=>{if(!freshCodes.length)return;const rows=[["code","label","batch"],...freshCodes.map((item)=>[item.code,item.label,item.batchName])];const csv="\\uFEFF"+rows.map((row)=>row.map(csvCell).join(",")).join("\\r\\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download="filmframe-invites.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),0)});
byId("clear-code").addEventListener("click",clearCreatedCodes);window.addEventListener("pagehide",clearCreatedCodes);
[byId("invite-search"),byId("batch-filter"),byId("status-filter")].forEach((control)=>control.addEventListener("input",applyFilters));applyFilters();
inviteList.addEventListener("click",async(event)=>{if(!(event.target instanceof Element))return;const button=event.target.closest(".revoke");if(!button||button.disabled||!confirm("撤销后，该邀请码签发的会话也会立即失效。确定继续？"))return;clearFeedback();button.disabled=true;try{const response=await fetch("/api/invites/"+encodeURIComponent(button.dataset.id)+"/revoke",{method:"POST",headers:csrfHeaders,body:"{}"});if(!response.ok)throw new Error();const row=button.closest("tr");row.dataset.status="revoked";setStatus(row.querySelector(".record-status"),"revoked",inviteStatusLabels);sessionList.querySelectorAll("tr[data-invite-id]").forEach((sessionRow)=>{if(sessionRow.dataset.inviteId===button.dataset.id)markSessionRevoked(sessionRow)});applyFilters();showNotice("邀请码及其设备会话已撤销。")}catch{button.disabled=false;showError("撤销失败，请稍后重试。")}});
batchList.addEventListener("click",async(event)=>{if(!(event.target instanceof Element))return;const button=event.target.closest(".revoke-batch");if(!button||button.disabled)return;const message="确定撤销批次「"+button.dataset.name+"」？将影响 "+button.dataset.count+" 个邀请码和 "+button.dataset.sessions+" 个有效设备会话。";if(!confirm(message))return;clearFeedback();button.disabled=true;try{const response=await fetch("/api/invite-batches/"+encodeURIComponent(button.dataset.id)+"/revoke",{method:"POST",headers:csrfHeaders,body:"{}"});if(!response.ok)throw new Error();const result=await response.json();button.textContent="已撤销";button.closest("tr").querySelector(".batch-sessions").textContent="0";inviteList.querySelectorAll("tr[data-batch-id]").forEach((row)=>{if(row.dataset.batchId===button.dataset.id){row.dataset.status="revoked";setStatus(row.querySelector(".record-status"),"revoked",inviteStatusLabels);row.querySelector(".revoke").disabled=true}});sessionList.querySelectorAll("tr[data-invite-id]").forEach((row)=>{const inviteRow=Array.from(inviteList.querySelectorAll("tr[data-record-id]")).find((item)=>item.dataset.recordId===row.dataset.inviteId);if(inviteRow?.dataset.batchId===button.dataset.id)markSessionRevoked(row)});applyFilters();showNotice("批次已撤销："+result.revokedInviteCount+" 个邀请码、"+result.revokedSessionCount+" 个设备会话已失效。")}catch{button.disabled=false;showError("批次撤销失败，请稍后重试。")}});
sessionList.addEventListener("click",async(event)=>{if(!(event.target instanceof Element))return;const button=event.target.closest(".revoke-session");if(!button||button.disabled||!confirm("确定只撤销这个设备会话？"))return;clearFeedback();button.disabled=true;try{const response=await fetch("/api/sessions/"+encodeURIComponent(button.dataset.id)+"/revoke",{method:"POST",headers:csrfHeaders,body:"{}"});if(!response.ok)throw new Error();markSessionRevoked(button.closest("tr"));showNotice("设备会话已撤销。")}catch{button.disabled=false;showError("会话撤销失败，请稍后重试。")}});`;

  return pageShell("FilmFrame 邀请管理", options.nonce, body, script);
}
