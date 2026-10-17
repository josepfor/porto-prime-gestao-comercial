/* Porto Prime PDV optimization: keyboard navigation and safe sale watchdog. */
(() => {
  'use strict';

  const visible = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const pdvRoot = () => document.querySelector('.legacy-pdv');
  const modalRoot = () => {
    const el = document.getElementById('modal');
    return el && visible(el) ? el : null;
  };

  function fieldsWithin(root) {
    if (!root) return [];
    return [...root.querySelectorAll('input:not([type="hidden"]), select, textarea, #pdvFinish')]
      .filter(el => visible(el) && !el.disabled && !el.readOnly && el.getAttribute('aria-hidden') !== 'true');
  }

  function focusField(el) {
    if (!el) return;
    el.focus();
    if (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) {
      try { el.select(); } catch {}
    }
  }

  function hidePdvResults() {
    const box = document.getElementById('pdvResults');
    const search = document.getElementById('pdvSearch');
    if (box) box.style.display = 'none';
    if (search) search.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    const root = pdvRoot();
    if (!root) return;

    if (event.key === 'Escape') {
      // Never dismiss an in-flight sale or invite a duplicate submission.
      if (window.__pdvSaleWatchActive || window.pdvFinishing) {
        event.preventDefault();
        return;
      }

      const modal = modalRoot();
      if (modal && typeof window.closeModal === 'function') {
        event.preventDefault();
        window.closeModal();
        return;
      }

      const results = document.getElementById('pdvResults');
      if (results && results.style.display !== 'none') {
        event.preventDefault();
        hidePdvResults();
        focusField(document.getElementById('pdvSearch'));
        return;
      }

      const fields = fieldsWithin(root);
      const index = fields.indexOf(event.target);
      if (index > 0) {
        event.preventDefault();
        focusField(fields[index - 1]);
      } else if (event.target !== document.getElementById('pdvSearch')) {
        event.preventDefault();
        focusField(document.getElementById('pdvSearch'));
      }
      return;
    }

    if (event.key !== 'Enter' || event.defaultPrevented) return;
    if (event.target === document.getElementById('pdvSearch')) return;
    if (event.target?.matches('button, a, [role="button"]')) return;
    if (!event.target?.matches('input, select, textarea')) return;

    // Existing PDV handlers keep priority for quantity, customer, discount,
    // payment method, cash received, and product lookup. This fills gaps such
    // as the payment amount field without replacing their validation.
    const payBox = document.getElementById('payBox');
    const isPaymentAmount = !!payBox && payBox.contains(event.target)
      && event.target.matches('input[type="number"]');
    if (isPaymentAmount && Array.isArray(payments) && payments.length) {
      const amount = Number(event.target.value);
      if (!Number.isFinite(amount) || amount < 0) {
        event.preventDefault();
        if (typeof window.toast === 'function') window.toast('Informe um valor de pagamento válido.');
        return;
      }
      payments[0].amount = amount;
      payments[0].touched = true;
      if (typeof window.updateCashChange === 'function') window.updateCashChange();
    }

    const modal = modalRoot();
    const scope = modal || root;
    const fields = fieldsWithin(scope);
    const index = fields.indexOf(event.target);
    if (index < 0 || !fields.length) return;
    event.preventDefault();
    // Enter advances through visible fields; it does not auto-submit forms.
    focusField(fields[(index + 1) % fields.length]);
  });

  // Show a non-modal warning if sale finalization takes unusually long.
  // Never abort the request: the server may already be committing the sale.
  function installSaleWatchdog() {
    if (typeof window.finishSale !== 'function' || window.__pdvSaleWatchInstalled) return;
    window.__pdvSaleWatchInstalled = true;
    const originalFinishSale = window.finishSale;

    window.finishSale = async function (...args) {
      if (window.__pdvSaleWatchActive) {
        if (typeof window.toast === 'function') {
          window.toast('Venda ainda em processamento. Não finalize novamente.');
        }
        return;
      }

      window.__pdvSaleWatchActive = true;
      let warningTimer;
      let warningEl;
      try {
        warningTimer = setTimeout(() => {
          const pdv = pdvRoot();
          if (!pdv) return;
          warningEl = document.getElementById('pdvSaleWatchdogWarning');
          if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.id = 'pdvSaleWatchdogWarning';
            warningEl.setAttribute('role', 'status');
            warningEl.style.cssText = 'margin:10px 0;padding:12px;border:1px solid #d97706;border-radius:8px;background:#fff7ed;color:#7c2d12;font-weight:600;';
            warningEl.textContent = 'A finalização está demorando mais que o esperado. Não clique novamente e não feche o aplicativo. Antes de tentar outra vez, confirme a venda, o estoque e o caixa.';
            const anchor = pdv.querySelector('.legacy-paybox') || pdv.firstElementChild;
            if (anchor) anchor.insertAdjacentElement('beforebegin', warningEl);
            else pdv.prepend(warningEl);
          }
        }, 12000);

        return await originalFinishSale.apply(this, args);
      } finally {
        clearTimeout(warningTimer);
        window.__pdvSaleWatchActive = false;
        // A successful sale re-renders the PDV; an ordinary validation/network
        // error must not leave the finalization button disabled forever.
        const button = document.getElementById('pdvFinish') || document.querySelector('.legacy-finish');
        if (button && !window.pdvFinishing) button.disabled = false;
        if (warningEl && warningEl.isConnected) warningEl.remove();
      }
    };
  }

  installSaleWatchdog();
  // app.js is loaded before this file; retry installation if the PDV script
  // initializes its global functions later than expected.
  if (typeof window.finishSale !== 'function') {
    document.addEventListener('DOMContentLoaded', installSaleWatchdog, { once: true });
  }

  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 2000) {
            console.warn('[Porto Prime PDV] Tarefa longa na interface:', Math.round(entry.duration), 'ms');
          }
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {}
  }
})();