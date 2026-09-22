// Shared request behavior. Navigation remains usable if an optional feed fails.
let dataFailure = false;
let staleData = false;
let oldestUpdate = null;
async function hockeyFetch(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, {once:true});
    try {
        const response = await fetch(url, {...options, signal: controller.signal});
        if (!response.ok) throw new Error('Hockey data is temporarily unavailable. Please try again shortly.');
        const updated = response.headers.get('X-Data-Updated');
        if (updated && (!oldestUpdate || new Date(updated) < new Date(oldestUpdate))) oldestUpdate = updated;
        staleData ||= response.headers.get('X-Data-Stale') === 'true';
        showDataStatus();
        return response;
    } catch (error) {
        if (options.signal?.aborted) throw error;
        dataFailure = true;
        showDataStatus();
        throw new Error('Hockey data is temporarily unavailable. Please try again shortly.');
    } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
    }
}
function showDataStatus() {
    // Cache diagnostics belong in developer tools, not the browsing experience.
    console.debug('[Barnwide data]', {unavailable: dataFailure, stale: staleData, updated: oldestUpdate});
}
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-links a').forEach(a => { if (a.pathname === location.pathname) a.setAttribute('aria-current','page'); });
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.tabIndex=0;th.setAttribute('role','button');th.setAttribute('aria-label',`Sort by ${th.textContent.trim()}`);
        th.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();th.click();}});
    });
    // Existing modal surfaces share keyboard dismissal and focus containment.
    let lastFocused = null;
    document.addEventListener('click',e=> {if (!e.target.closest('[role="dialog"]')) lastFocused=document.activeElement;},true);
    const observer = new MutationObserver(() => {
        document.querySelectorAll('[id$="Modal"], .fixed.inset-0.z-50').forEach(modal => {
            if (getComputedStyle(modal).display==='none') return;
            if (!modal.hasAttribute('role')) {modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',modal.querySelector('h2,h3')?.textContent || 'Details');}
            if (!modal.contains(document.activeElement)) modal.querySelector('button,a,input,select')?.focus();
        });
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    document.addEventListener('keydown',e=> {
        const modal=[...document.querySelectorAll('[role="dialog"]')].find(m=>getComputedStyle(m).display!=='none');
        if(!modal)return;
        if(e.key==='Escape'){modal.classList.add('hidden');lastFocused?.focus();}
        if(e.key==='Tab'){
            const controls=[...modal.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(el=>el.getClientRects().length);
            const first=controls[0],last=controls.at(-1);
            if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
            else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
        }
    });
});
