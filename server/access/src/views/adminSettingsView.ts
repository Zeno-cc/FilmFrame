import {
  MAX_MAX_CANVAS_MIB,
  MIN_MAX_CANVAS_MIB,
  type RenderBudgetSetting,
} from "../runtimeConfig.js";

export function renderAdminSettingsView(setting: RenderBudgetSetting): string {
  return `<section id="admin-view-settings" class="admin-view settings-view" aria-labelledby="settings-title" hidden>
  <div class="settings-heading"><div><p class="eyebrow">Runtime Policy</p><h2 id="settings-title">运行配置</h2></div><span id="render-budget-current" class="settings-current">${setting.maxCanvasMiB} MiB</span></div>
  <form id="render-budget-form" class="settings-form">
    <div class="settings-copy"><label for="render-budget-number">Canvas 内存预算</label><p>用于单张与长条成片的 RGBA 画布准入。调高预算不代表当前浏览器一定可以完成分配。</p></div>
    <div class="settings-control">
      <input id="render-budget-range" type="range" min="${MIN_MAX_CANVAS_MIB}" max="${MAX_MAX_CANVAS_MIB}" step="32" value="${setting.maxCanvasMiB}" aria-label="Canvas 内存预算滑块">
      <div class="settings-number"><input id="render-budget-number" type="number" min="${MIN_MAX_CANVAS_MIB}" max="${MAX_MAX_CANVAS_MIB}" step="1" value="${setting.maxCanvasMiB}" required><span>MiB</span></div>
      <div class="settings-scale"><span>${MIN_MAX_CANVAS_MIB} MiB</span><span>${MAX_MAX_CANVAS_MIB} MiB</span></div>
    </div>
    <div class="settings-actions"><p id="render-budget-meta" class="muted">${setting.updatedAt > 0 ? "已保存；刷新主站后生效" : "默认值；刷新主站后生效"}</p><button id="save-render-budget" class="button" type="submit">保存配置</button></div>
  </form>
</section>`;
}

export const adminSettingsStyles = `
  .settings-view{padding-top:30px}.settings-heading{display:flex;align-items:center;justify-content:space-between;gap:18px}.settings-heading h2{margin:4px 0 0}.settings-current{border-left:2px solid #d9973e;padding-left:10px;color:#f0c27d;font:500 20px/1.2 ui-monospace,SFMono-Regular,monospace}
  .settings-form{margin-top:24px;border-top:1px solid #423c33;border-bottom:1px solid #423c33;padding:28px 0}.settings-copy{display:grid;grid-template-columns:minmax(180px,.7fr) minmax(260px,1.3fr);gap:28px}.settings-copy label{font-size:15px;font-weight:600}.settings-copy p{margin:0;color:#aaa194;font-size:12px;line-height:1.75}.settings-control{display:grid;grid-template-columns:minmax(0,1fr) 140px;gap:18px;margin-top:28px}.settings-control input[type="range"]{width:100%;accent-color:#d9973e}.settings-number{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;border:1px solid #5c5448;background:#15130f}.settings-number input{width:100%;min-height:44px;border:0;background:transparent;color:#fff;padding:0 10px}.settings-number span{padding-right:10px;color:#9f968a;font-size:12px}.settings-scale{grid-column:1/2;display:flex;justify-content:space-between;color:#7f786f;font-size:10px}.settings-actions{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:26px}.settings-actions p{margin:0;font-size:12px}
  @media(max-width:700px){.settings-heading{align-items:flex-start}.settings-copy{grid-template-columns:1fr;gap:8px}.settings-control{grid-template-columns:1fr}.settings-scale{grid-column:auto}.settings-actions{align-items:stretch;flex-direction:column}.settings-actions .button{width:100%}}
`;

export const adminSettingsScript = `
const renderBudgetForm=byId("render-budget-form"),renderBudgetRange=byId("render-budget-range"),renderBudgetNumber=byId("render-budget-number"),renderBudgetButton=byId("save-render-budget");
let renderBudgetBusy=false;
function syncRenderBudget(source,target){target.value=source.value}
renderBudgetRange.addEventListener("input",()=>syncRenderBudget(renderBudgetRange,renderBudgetNumber));
renderBudgetNumber.addEventListener("input",()=>{const value=Number(renderBudgetNumber.value);if(Number.isInteger(value)&&value>=${MIN_MAX_CANVAS_MIB}&&value<=${MAX_MAX_CANVAS_MIB})renderBudgetRange.value=String(value)});
renderBudgetForm.addEventListener("submit",async(event)=>{event.preventDefault();if(renderBudgetBusy)return;clearFeedback();const maxCanvasMiB=Number(renderBudgetNumber.value);if(!Number.isInteger(maxCanvasMiB)||maxCanvasMiB<${MIN_MAX_CANVAS_MIB}||maxCanvasMiB>${MAX_MAX_CANVAS_MIB}){showError("Canvas 内存预算必须是 ${MIN_MAX_CANVAS_MIB} 至 ${MAX_MAX_CANVAS_MIB} 之间的整数。");return}renderBudgetBusy=true;renderBudgetButton.disabled=true;renderBudgetButton.textContent="保存中";try{const response=await fetch("/api/runtime-settings/render-budget",{method:"PUT",headers:csrfHeaders,body:JSON.stringify({maxCanvasMiB})});const body=await response.json();if(!response.ok||!body||!body.renderBudget)throw new Error();const saved=body.renderBudget;renderBudgetNumber.value=String(saved.maxCanvasMiB);renderBudgetRange.value=String(saved.maxCanvasMiB);byId("render-budget-current").textContent=saved.maxCanvasMiB+" MiB";byId("render-budget-meta").textContent="已保存；刷新主站后生效";showNotice("运行配置已保存。")}catch{showError("配置未确认，请保持当前数值后重试。")}finally{renderBudgetBusy=false;renderBudgetButton.disabled=false;renderBudgetButton.textContent="保存配置"}});
`;
