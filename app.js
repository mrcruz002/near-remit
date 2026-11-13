/* NearRemit — cross-chain remittance demo on NEAR Intents (1-Click Swap API).
   No wallet connection, no keys, no sign-up. The page only calls the public
   1-Click API: GET /v0/tokens (not used — routes are curated below),
   POST /v0/quote and GET /v0/status. See README.md. */
(function () {
  'use strict';

  var API = 'https://1click.chaindefuser.com';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- theme ---------- */
  (function () {
    var btn = $('themeBtn'), label = $('themeLabel');
    function apply(t) {
      document.documentElement.dataset.theme = t;
      if (label) label.textContent = t === 'dark' ? 'Light' : 'Dark';
      try { localStorage.setItem('nearremit-theme', t); } catch (e) {}
    }
    try { apply(localStorage.getItem('nearremit-theme') || 'dark'); } catch (e) { apply('dark'); }
    if (btn) btn.onclick = function () {
      apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    };
  })();

  /* ---------- routes (assetIds verified live against GET /v0/tokens, 2026-11-13) ---------- */
  var CHAINS = {
    eth:  { label: 'Ethereum', kind: 'evm',  explorer: 'https://etherscan.io/tx/' },
    base: { label: 'Base',     kind: 'evm',  explorer: 'https://basescan.org/tx/' },
    near: { label: 'NEAR',     kind: 'near', explorer: 'https://explorer.near.org/transactions/' },
  };
  var ROUTES = [
    { id: 'usdc-eth-usdc-base', label: 'USDC on Ethereum → USDC on Base',
      origin: { chain: 'eth',  symbol: 'USDC', assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', decimals: 6 },
      dest:   { chain: 'base', symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6 },
      defAmount: '1' },
    { id: 'usdc-base-usdc-eth', label: 'USDC on Base → USDC on Ethereum',
      origin: { chain: 'base', symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6 },
      dest:   { chain: 'eth',  symbol: 'USDC', assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', decimals: 6 },
      defAmount: '1' },
    { id: 'usdc-eth-usdc-near', label: 'USDC on Ethereum → USDC on NEAR',
      origin: { chain: 'eth',  symbol: 'USDC', assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', decimals: 6 },
      dest:   { chain: 'near', symbol: 'USDC', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6 },
      defAmount: '1' },
    { id: 'usdc-base-usdc-near', label: 'USDC on Base → USDC on NEAR',
      origin: { chain: 'base', symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6 },
      dest:   { chain: 'near', symbol: 'USDC', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6 },
      defAmount: '1' },
    { id: 'near-usdc-base', label: 'NEAR on NEAR → USDC on Base',
      origin: { chain: 'near', symbol: 'NEAR', assetId: 'nep141:wrap.near', decimals: 24 },
      dest:   { chain: 'base', symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6 },
      defAmount: '0.3' },
    { id: 'eth-usdc-base', label: 'ETH on Ethereum → USDC on Base',
      origin: { chain: 'eth',  symbol: 'ETH',  assetId: 'nep141:eth.omft.near', decimals: 18 },
      dest:   { chain: 'base', symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6 },
      defAmount: '0.001' },
    { id: 'usdc-base-near', label: 'USDC on Base → NEAR on NEAR',
      origin: { chain: 'base', symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6 },
      dest:   { chain: 'near', symbol: 'NEAR', assetId: 'nep141:wrap.near', decimals: 24 },
      defAmount: '1' },
  ];

  var state = {
    route: ROUTES[0],
    dryQuote: null,       // last dry (price-only) quote response
    liveQuote: null,      // last live quote response (has depositAddress)
    pollTimer: null,
    tracking: null,       // depositAddress currently being polled
  };

  /* ---------- helpers ---------- */
  function showStatus(id, kind, title, hint) {
    var el = $(id);
    el.className = 'status show ' + kind;
    el.textContent = '';
    var b = document.createElement('b');
    b.textContent = title;
    el.appendChild(b);
    if (hint) {
      var s = document.createElement('span');
      s.className = 'hint';
      s.textContent = hint;
      el.appendChild(s);
    }
  }
  function hideStatus(id) { var el = $(id); el.className = 'status'; el.textContent = ''; }

  function copyText(t, btn, label) {
    label = label || 'Copy';
    var done = function () { if (btn) { btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = label; }, 1600); } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done).catch(function () { fallbackCopy(t, done); });
    } else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) {}
    document.body.removeChild(ta);
  }

  var EVM_RE = /^0x[0-9a-fA-F]{40}$/;
  var NEAR_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
  var NEAR_HEX_RE = /^[0-9a-f]{64}$/;
  function validAddress(addr, chain) {
    if (!addr) return false;
    if (CHAINS[chain].kind === 'evm') return EVM_RE.test(addr.trim());
    var a = addr.trim();
    return (a.length >= 2 && a.length <= 64 && NEAR_RE.test(a)) || NEAR_HEX_RE.test(a);
  }
  function addrPlaceholder(chain) {
    return CHAINS[chain].kind === 'evm' ? '0x… (e.g. your wallet address)' : 'name.near (e.g. the recipient’s NEAR account)';
  }

  /* Decimal string -> base-unit integer string, exact (no floats). */
  function toBaseUnits(human, decimals) {
    var s = String(human).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var parts = s.split('.');
    var whole = parts[0].replace(/^0+(?=\d)/, '') || '0';
    var frac = (parts[1] || '').slice(0, decimals);
    while (frac.length < decimals) frac += '0';
    var out = (whole + frac).replace(/^0+(?=\d)/, '');
    return out === '' ? '0' : out;
  }
  /* Base-unit integer string -> human string with up to `decimals` places. */
  function fromBaseUnits(base, decimals) {
    var s = String(base).replace(/^0+(?=\d)/, '') || '0';
    if (decimals === 0) return s;
    while (s.length <= decimals) s = '0' + s;
    var whole = s.slice(0, s.length - decimals);
    var frac = s.slice(s.length - decimals).replace(/0+$/, '');
    return frac ? whole + '.' + frac : whole;
  }
  function fmtUsd(v) {
    var n = parseFloat(v);
    if (!isFinite(n)) return '—';
    return '$' + n.toFixed(n < 1 ? 4 : 2);
  }
  function fmtSeconds(sec) {
    var n = parseInt(sec, 10);
    if (!isFinite(n)) return '—';
    if (n < 90) return 'about ' + n + ' seconds';
    return 'about ' + Math.round(n / 60) + ' minute' + (Math.round(n / 60) === 1 ? '' : 's');
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? String(iso) : d.toLocaleString();
  }

  /* ---------- stepper ---------- */
  var maxStep = 1;
  function setStep(n) {
    maxStep = Math.max(maxStep, n);
    document.querySelectorAll('.step-nav').forEach(function (el) {
      var s = +el.dataset.step;
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
    });
    for (var i = 1; i <= 5; i++) $('card' + i).classList.toggle('hidden', i > maxStep);
    var nav = $('stepsNav');
    if (nav && typeof nav.scrollIntoView === 'function') nav.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- route UI ---------- */
  var routeSel = $('route');
  ROUTES.forEach(function (r) {
    var o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.label;
    routeSel.appendChild(o);
  });
  function currentRoute() {
    return ROUTES.find(function (r) { return r.id === routeSel.value; }) || ROUTES[0];
  }
  function applyRoute() {
    state.route = currentRoute();
    var r = state.route;
    $('routeHint').textContent = 'You send ' + r.origin.symbol + ' on ' + CHAINS[r.origin.chain].label +
      ' · They receive ' + r.dest.symbol + ' on ' + CHAINS[r.dest.chain].label + '.';
    $('amount').value = r.defAmount;
    $('amountHint').textContent = r.defAmount + ' ' + r.origin.symbol + ' on ' + CHAINS[r.origin.chain].label;
    $('refundTo').placeholder = addrPlaceholder(r.origin.chain);
    $('refundHint').textContent = 'If the swap fails, the ' + r.origin.symbol + ' comes back to this address on ' +
      CHAINS[r.origin.chain].label + '.';
    $('destSummary').textContent = r.dest.symbol + ' on ' + CHAINS[r.dest.chain].label;
    $('recipient').placeholder = addrPlaceholder(r.dest.chain);
    $('recipientHint').textContent = 'Double-check this — a swap sent to the wrong address on ' +
      CHAINS[r.dest.chain].label + ' cannot be undone.';
    state.dryQuote = null; state.liveQuote = null;
    $('quoteResult').classList.add('hidden');
    $('depositResult').classList.add('hidden');
    hideStatus('status3'); hideStatus('status4');
  }
  routeSel.addEventListener('change', applyRoute);

  /* ---------- validation ---------- */
  function validateStep1() {
    var ok = true;
    var amt = toBaseUnits($('amount').value, state.route.origin.decimals);
    var amtField = $('amountField');
    if (!amt || amt === '0') { amtField.classList.add('invalid'); ok = false; }
    else amtField.classList.remove('invalid');
    var refund = $('refundTo').value.trim();
    var refundField = $('refundField');
    if (!validAddress(refund, state.route.origin.chain)) { refundField.classList.add('invalid'); ok = false; }
    else refundField.classList.remove('invalid');
    if (!ok) showStatus('status1', 'err', 'Check the fields above.', 'The amount must be greater than 0 and the refund address must match the origin chain.');
    else hideStatus('status1');
    return ok;
  }
  function validateStep2() {
    var ok = true;
    var rec = $('recipient').value.trim();
    var f = $('recipientField');
    if (!validAddress(rec, state.route.dest.chain)) { f.classList.add('invalid'); ok = false; }
    else f.classList.remove('invalid');
    if (!ok) showStatus('status2', 'err', 'That recipient address does not look right.', 'It must be an address on ' + CHAINS[state.route.dest.chain].label + '.');
    else hideStatus('status2');
    return ok;
  }

  /* ---------- 1-Click API ---------- */
  function quoteBody(dry) {
    var r = state.route;
    var amountBase = toBaseUnits($('amount').value, r.origin.decimals);
    return {
      dry: dry,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: r.origin.assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: r.dest.assetId,
      amount: amountBase,
      refundTo: $('refundTo').value.trim(),
      refundType: 'ORIGIN_CHAIN',
      recipient: $('recipient').value.trim(),
      recipientType: 'DESTINATION_CHAIN',
      deadline: new Date(Date.now() + 3600e3).toISOString(),
      depositMode: 'SIMPLE',
      /* NOTE: do not send quoteWaitingTimeMs — with it set, the API hangs
         instead of answering (verified 2026-11-13). Omitting it returns in ~1s. */
    };
  }
  async function requestQuote(dry) {
    var res = await fetch(API + '/v0/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(quoteBody(dry)),
    });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var msg = body.message || body.error || ('Quote failed (HTTP ' + res.status + ').');
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 300));
    }
    return body;
  }
  async function fetchStatus(depositAddress, depositMemo) {
    var url = API + '/v0/status?depositAddress=' + encodeURIComponent(depositAddress);
    if (depositMemo) url += '&depositMemo=' + encodeURIComponent(depositMemo);
    var res = await fetch(url);
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(body.message || ('Status check failed (HTTP ' + res.status + ').'));
    return body;
  }

  /* ---------- step flow ---------- */
  $('btnNext1').onclick = function () { if (validateStep1()) setStep(2); };
  $('btnBack2').onclick = function () { setStep(1); };
  $('btnNext2').onclick = function () { if (validateStep2()) { setStep(3); $('btnQuote').click(); } };

  function renderQuote(q) {
    var r = state.route;
    var out = q.quote;
    $('qSend').textContent = out.amountInFormatted + ' ' + r.origin.symbol + ' (' + fmtUsd(out.amountInUsd) + ')';
    $('qReceive').textContent = out.amountOutFormatted + ' ' + r.dest.symbol + ' (' + fmtUsd(out.amountOutUsd) + ')';
    $('qMinOut').textContent = fromBaseUnits(out.minAmountOut, r.dest.decimals) + ' ' + r.dest.symbol + ' (worst case at 1% slippage)';
    var rate = parseFloat(out.amountOutFormatted) / parseFloat(out.amountInFormatted);
    $('qRate').textContent = isFinite(rate)
      ? '1 ' + r.origin.symbol + ' ≈ ' + rate.toPrecision(4) + ' ' + r.dest.symbol
      : '—';
    $('qTime').textContent = fmtSeconds(out.timeEstimate);
    var refundFee = out.refundFee ? fromBaseUnits(out.refundFee, r.origin.decimals) + ' ' + r.origin.symbol + ' (only if refunded)' : '—';
    var withdrawFee = out.withdrawFee ? fromBaseUnits(out.withdrawFee, r.dest.decimals) + ' ' + r.dest.symbol : '—';
    $('qFees').textContent = 'Withdraw: ' + withdrawFee + ' · Refund: ' + refundFee + ' (as reported by the quote)';
    $('qRef').textContent = q.correlationId || '—';
    $('quoteResult').classList.remove('hidden');
  }

  $('btnQuote').onclick = async function () {
    hideStatus('status3');
    var btn = $('btnQuote');
    btn.disabled = true; btn.textContent = 'Asking solvers…';
    try {
      var q = await requestQuote(true);
      state.dryQuote = q;
      renderQuote(q);
      showStatus('status3', 'ok', 'Live quote ready.',
        'This price is real and free — nothing has moved. Create a deposit address when you are happy with it.');
    } catch (e) {
      showStatus('status3', 'err', 'Could not get a quote.', String(e && e.message || e));
    } finally {
      btn.disabled = false; btn.textContent = 'Get quote';
    }
  };
  $('btnRefreshQuote').onclick = function () { $('btnQuote').click(); };

  $('btnDeposit').onclick = async function () {
    hideStatus('status4');
    var btn = $('btnDeposit');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      var q = await requestQuote(false);
      state.liveQuote = q;
      var out = q.quote;
      var r = state.route;
      $('dAmount').textContent = out.amountInFormatted + ' ' + r.origin.symbol;
      $('dToken').textContent = r.origin.symbol + ' on ' + CHAINS[r.origin.chain].label + ' — and nothing else';
      $('dDeadline').textContent = fmtDate(out.deadline) + ' (deposit address expires then)';
      $('dAddress').textContent = out.depositAddress;
      if (out.depositMemo) {
        $('dMemo').textContent = out.depositMemo;
        $('dMemoRow').style.display = 'block';
      } else $('dMemoRow').style.display = 'none';
      $('depositResult').classList.remove('hidden');
      setStep(4);
      showStatus('status4', 'ok', 'Deposit address ready.',
        'Send exactly ' + out.amountInFormatted + ' ' + r.origin.symbol + ' on ' + CHAINS[r.origin.chain].label + ' to it. The swap starts when the deposit lands.');
    } catch (e) {
      showStatus('status4', 'err', 'Could not create a deposit address.', String(e && e.message || e));
    } finally {
      btn.disabled = false; btn.textContent = 'Create deposit address →';
    }
  };
  $('btnCopyDeposit').onclick = function (e) { copyText($('dAddress').textContent, e.currentTarget, 'Copy'); };
  $('btnCopyDetails').onclick = function (e) {
    var r = state.route, q = state.liveQuote && state.liveQuote.quote;
    if (!q) return;
    var text = [
      'NearRemit — deposit details',
      'Send exactly: ' + q.amountInFormatted + ' ' + r.origin.symbol + ' on ' + CHAINS[r.origin.chain].label,
      'Deposit address: ' + q.depositAddress,
      q.depositMemo ? 'Memo: ' + q.depositMemo : null,
      'Recipient gets: ' + q.amountOutFormatted + ' ' + r.dest.symbol + ' on ' + CHAINS[r.dest.chain].label,
      'Valid until: ' + fmtDate(q.deadline),
      'Quote ref: ' + (state.liveQuote.correlationId || ''),
    ].filter(Boolean).join('\n');
    copyText(text, e.currentTarget, 'Copy all details');
  };

  /* ---------- tracking ---------- */
  var TERMINAL = { SUCCESS: true, REFUNDED: true, FAILED: true };
  var STATE_LABEL = {
    PENDING_DEPOSIT: 'Waiting for your deposit',
    KNOWN_DEPOSIT_TX: 'Deposit seen — solvers have it',
    PROCESSING: 'Settling the swap',
    SUCCESS: 'Delivered to the recipient',
    INCOMPLETE_DEPOSIT: 'Deposit was below the required amount',
    REFUNDED: 'Refunded to your address',
    FAILED: 'Swap failed',
  };
  function renderTracker(status, details) {
    var order = ['PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'SUCCESS'];
    var idx = order.indexOf(status);
    var failed = status === 'REFUNDED' || status === 'FAILED';
    document.querySelectorAll('#tracker .track-step').forEach(function (el) {
      var s = el.dataset.state;
      var si = order.indexOf(s);
      el.classList.remove('active', 'done', 'failed');
      if (failed && s === 'SUCCESS') { el.classList.add('failed'); return; }
      if (idx >= 0 && si < idx) el.classList.add('done');
      else if (idx >= 0 && si === idx) el.classList.add('active');
      else if (idx < 0 && s === 'PENDING_DEPOSIT') el.classList.add('active');
    });
    $('trackState').textContent = 'Status: ' + (STATE_LABEL[status] || status) +
      (details && details.updatedAt ? ' · updated ' + fmtDate(details.updatedAt) : '');
    var links = $('txLinks');
    links.textContent = '';
    if (details && details.swapDetails) {
      var sd = details.swapDetails;
      (sd.originChainTxHashes || []).forEach(function (h) {
        addTxLink(links, 'Origin tx: ', h, CHAINS[state.route.origin.chain].explorer);
      });
      (sd.destinationChainTxHashes || []).forEach(function (h) {
        addTxLink(links, 'Destination tx: ', h, CHAINS[state.route.dest.chain].explorer);
      });
      if (sd.amountOutFormatted) {
        var p = document.createElement('div');
        p.textContent = 'Delivered: ' + sd.amountOutFormatted + ' ' + state.route.dest.symbol +
          (sd.amountOutUsd ? ' (' + fmtUsd(sd.amountOutUsd) + ')' : '');
        links.appendChild(p);
      }
      if (sd.refundedAmountFormatted && sd.refundedAmountFormatted !== '0') {
        var pr = document.createElement('div');
        pr.textContent = 'Refunded: ' + sd.refundedAmountFormatted + ' ' + state.route.origin.symbol +
          (sd.refundReason ? ' — ' + sd.refundReason : '');
        links.appendChild(pr);
      }
    }
    return TERMINAL[status] === true;
  }
  function addTxLink(box, label, hash, explorer) {
    var div = document.createElement('div');
    div.textContent = label;
    var a = document.createElement('a');
    a.href = explorer + hash;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = hash.length > 24 ? hash.slice(0, 12) + '…' + hash.slice(-10) : hash;
    div.appendChild(a);
    box.appendChild(div);
  }
  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    state.tracking = null;
  }
  async function pollOnce() {
    if (!state.tracking) return;
    try {
      var memo = state.liveQuote && state.liveQuote.quote ? state.liveQuote.quote.depositMemo : null;
      var res = await fetchStatus(state.tracking, memo);
      var done = renderTracker(res.status, res);
      if (done) {
        stopPolling();
        if (res.status === 'SUCCESS') showStatus('status5', 'ok', 'Delivered.', 'The recipient got the money. Links above go to the chain explorers.');
        else if (res.status === 'REFUNDED') showStatus('status5', 'warn', 'Refunded.', 'The swap did not complete — the deposit went back to your refund address, minus the refund fee.');
        else showStatus('status5', 'err', 'Swap failed.', 'Check the details above; the deposit should be refunded to your address.');
      }
    } catch (e) {
      showStatus('status5', 'err', 'Status check failed.', String(e && e.message || e) + ' — retrying automatically.');
    }
  }
  function startTracking(depositAddress) {
    stopPolling();
    state.tracking = depositAddress;
    setStep(5);
    $('trackState').textContent = 'Status: checking…';
    pollOnce();
    state.pollTimer = setInterval(pollOnce, 10000);
  }
  $('btnTrack').onclick = function () {
    var q = state.liveQuote && state.liveQuote.quote;
    if (q && q.depositAddress) startTracking(q.depositAddress);
  };
  $('btnLookup').onclick = function () {
    var addr = $('lookupAddr').value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      showStatus('status5', 'err', 'That is not a deposit address.', 'Deposit addresses on EVM chains look like 0x followed by 40 hex characters.');
      return;
    }
    hideStatus('status5');
    startTracking(addr);
  };
  $('btnStopTrack').onclick = function () {
    stopPolling();
    showStatus('status5', 'warn', 'Tracking stopped.', 'Paste the deposit address above any time to check again.');
  };

  /* ---------- init ---------- */
  applyRoute();
  setStep(1);
})();
