/* NearRemit — cross-chain remittance demo on NEAR Intents (1-Click Swap API).
   No wallet connection, no keys, no sign-up. The page only calls the public
   1-Click API: GET /v0/tokens (live prices + the token list for the picker),
   POST /v0/quote and GET /v0/status. See README.md. */
(function () {
  'use strict';

  var API = 'https://1click.chaindefuser.com';
  var $ = function (id) { return document.getElementById(id); };

  /* Every API call gets a timeout — on a slow connection a request must
     fail fast with a clear message instead of hanging the button forever
     ("Asking solvers…" with nothing happening). */
  var API_TIMEOUT_MS = 25000;
  function fetchWithTimeout(url, options) {
    /* Race the request against a timer: whatever the request does — even
       if it ignores an abort — the caller gets an answer within 25s. */
    var timeoutErr = new Error('The request timed out — check your connection and try again.');
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(timeoutErr); }, API_TIMEOUT_MS);
    });
    return Promise.race([fetch(url, options), timeout]);
  }

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

  /* ---------- persistence: a refresh must never lose a swap ----------
     The full swap state is saved to localStorage on every step — route,
     amount + $/token mode, addresses, quotes, deposit address, deadline,
     memo and tracking state. On load it is restored automatically and
     tracking resumes. "Start over" wipes it. Nothing leaves the browser. */
  var SWAP_KEY = 'nearremit-swap-v1';
  var persistReady = false; // false until init has restored (so init never overwrites a saved swap)
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
  function saveState() {
    if (!persistReady) return;
    try {
      lsSet(SWAP_KEY, JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        step: maxStep,
        from: state.from ? state.from.assetId : null,
        to: state.to ? state.to.assetId : null,
        amountMode: state.amountMode,
        amount: $('amount').value,
        refundTo: $('refundTo').value,
        recipient: $('recipient').value,
        dryQuote: state.dryQuote,
        liveQuote: state.liveQuote,
        tracking: state.tracking
      }));
    } catch (e) {}
  }
  function loadSavedState() {
    try {
      var raw = lsGet(SWAP_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.version !== 1) return null;
      return d;
    } catch (e) { return null; }
  }
  function clearSavedSwap() {
    lsDel(SWAP_KEY);
    location.reload();
  }
  function urlParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }
  function pageBaseUrl() {
    if (window.location.origin && window.location.origin !== 'null') return window.location.origin + window.location.pathname;
    return window.location.href.split('?')[0].split('#')[0];
  }
  function restoreSavedState() {
    var d = loadSavedState();
    if (!d) return false;
    var hasAnything = !!(d.from || d.to || d.dryQuote || d.liveQuote || (d.amount && d.amount !== '1') || d.refundTo || d.recipient);
    if (!hasAnything) return false;
    if (d.from) { var f = tokenByAssetId(d.from); if (f) state.from = f; }
    if (d.to) { var t = tokenByAssetId(d.to); if (t) state.to = t; }
    if (d.amountMode === 'usd' || d.amountMode === 'token') state.amountMode = d.amountMode;
    if (typeof d.amount === 'string' && d.amount) $('amount').value = d.amount;
    if (typeof d.refundTo === 'string') $('refundTo').value = d.refundTo;
    if (typeof d.recipient === 'string') $('recipient').value = d.recipient;
    applySelection();
    var resumedStep = 1;
    if (d.dryQuote) {
      state.dryQuote = d.dryQuote;
      renderQuote(d.dryQuote);
      resumedStep = Math.max(d.step || 3, 3);
    }
    var expired = false;
    if (d.liveQuote && d.liveQuote.quote && d.liveQuote.quote.depositAddress) {
      state.liveQuote = d.liveQuote;
      renderDeposit(d.liveQuote);
      resumedStep = Math.max(d.step || 4, 4);
      expired = !!(d.liveQuote.quote.deadline && new Date(d.liveQuote.quote.deadline).getTime() < Date.now());
      if (expired) {
        showStatus('status4', 'warn', 'This deposit address has expired.',
          'It was valid until ' + fmtDate(d.liveQuote.quote.deadline) + '. Do not send to it — start over for a fresh quote.');
      }
    }
    maxStep = Math.max(maxStep, resumedStep);
    setStep(resumedStep, true);
    var trackingResumes = !!(d.tracking && state.liveQuote && state.liveQuote.quote && state.liveQuote.quote.depositAddress && !expired);
    if (d.liveQuote && d.liveQuote.quote) {
      var a = d.liveQuote.quote.depositAddress;
      $('resumeText').textContent = 'Deposit address ' + a.slice(0, 10) + '…' + a.slice(-6) +
        ' and your ' + state.from.symbol + ' → ' + state.to.symbol + ' route were saved in this browser.' +
        (expired ? ' The deposit address has expired — do not send to it.'
                 : trackingResumes ? ' Tracking picks up again below.'
                 : ' Press "Track this swap" below to follow it.');
    } else {
      $('resumeText').textContent = 'Your route, amount and addresses were saved in this browser.';
    }
    $('resumeBanner').classList.remove('hidden');
    if (trackingResumes) {
      startTracking(state.liveQuote.quote.depositAddress, true);
    } else if (resumedStep >= 5 && state.liveQuote && state.liveQuote.quote && state.liveQuote.quote.depositAddress && !expired) {
      // Was on the tracking step but tracking had stopped (finished or
      // stopped): one status check, no polling, so the last state still shows.
      (function (addr, memo) {
        fetchStatus(addr, memo)
          .then(function (res) { renderTracker(res.status, res); })
          .catch(function () {});
      })(state.liveQuote.quote.depositAddress, state.liveQuote.quote.depositMemo);
    }
    return true;
  }

  /* ---------- chains ---------- */
  var CHAINS = {
    eth:    { label: 'Ethereum',  kind: 'evm',  explorer: 'https://etherscan.io/tx/' },
    base:   { label: 'Base',      kind: 'evm',  explorer: 'https://basescan.org/tx/' },
    near:   { label: 'NEAR',      kind: 'near', explorer: 'https://explorer.near.org/transactions/' },
    arb:    { label: 'Arbitrum',  kind: 'evm',  explorer: 'https://arbiscan.io/tx/' },
    op:     { label: 'Optimism',  kind: 'evm',  explorer: 'https://optimistic.etherscan.io/tx/' },
    bsc:    { label: 'BNB Chain', kind: 'evm',  explorer: 'https://bscscan.com/tx/' },
    avax:   { label: 'Avalanche', kind: 'evm',  explorer: 'https://snowtrace.io/tx/' },
    gnosis: { label: 'Gnosis',    kind: 'evm',  explorer: 'https://gnosisscan.io/tx/' },
    pol:    { label: 'Polygon',   kind: 'evm',  explorer: 'https://polygonscan.com/tx/' },
    sol:    { label: 'Solana',    kind: 'sol',  explorer: 'https://solscan.io/tx/' },
    hood:   { label: 'Robinhood', kind: 'evm',  explorer: 'https://robinhoodchain.blockscout.com/tx/' },
  };
  var CHAIN_ORDER = ['eth', 'base', 'near', 'arb', 'op', 'bsc', 'avax', 'gnosis', 'pol', 'sol', 'hood'];

  /* ---------- tokens (curated from GET /v0/tokens, verified live 2026-11-13;
     Robinhood ('hood') added 2026-11-14, verified live the same day.
     The API lists ~230 tokens; this is the sensible shortlist — the major
     tokens on each chain we can take deposits from and pay out to. Prices come
     from the live API at load time; assetIds and decimals are fixed here. ---------- */
  var TOKENS = [
    { chain: 'eth', symbol: 'USDC', assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', decimals: 6 },
    { chain: 'eth', symbol: 'USDT', assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near', decimals: 6 },
    { chain: 'eth', symbol: 'ETH', assetId: 'nep141:eth.omft.near', decimals: 18 },
    { chain: 'eth', symbol: 'WETH', assetId: 'nep141:eth-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.omft.near', decimals: 18 },
    { chain: 'eth', symbol: 'DAI', assetId: 'nep141:eth-0x6b175474e89094c44da98b954eedeac495271d0f.omft.near', decimals: 18 },
    { chain: 'eth', symbol: 'WBTC', assetId: 'nep141:eth-0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.omft.near', decimals: 8 },
    { chain: 'eth', symbol: 'LINK', assetId: 'nep141:eth-0x514910771af9ca656af840dff83e8264ecf986ca.omft.near', decimals: 18 },
    { chain: 'eth', symbol: 'UNI', assetId: 'nep141:eth-0x1f9840a85d5af5bf1d1762f925bdaddc4201f984.omft.near', decimals: 18 },
    { chain: 'eth', symbol: 'AAVE', assetId: 'nep141:eth-0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9.omft.near', decimals: 18 },
    { chain: 'base', symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6 },
    { chain: 'base', symbol: 'ETH', assetId: 'nep141:base.omft.near', decimals: 18 },
    { chain: 'base', symbol: 'WETH', assetId: 'nep141:base-0x4200000000000000000000000000000000000006.omft.near', decimals: 18 },
    { chain: 'base', symbol: 'cbBTC', assetId: 'nep141:base-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near', decimals: 8 },
    { chain: 'base', symbol: 'BRETT', assetId: 'nep141:base-0x532f27101965dd16442e59d40670faf5ebb142e4.omft.near', decimals: 18 },
    { chain: 'near', symbol: 'USDC', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6 },
    { chain: 'near', symbol: 'USDT', assetId: 'nep141:usdt.tether-token.near', decimals: 6 },
    { chain: 'near', symbol: 'NEAR', assetId: 'nep141:wrap.near', decimals: 24 },
    { chain: 'near', symbol: 'ETH', assetId: 'nep141:eth.bridge.near', decimals: 18 },
    { chain: 'near', symbol: 'stNEAR', assetId: 'nep141:meta-pool.near', decimals: 24 },
    { chain: 'near', symbol: 'BTC', assetId: 'nep141:nbtc.bridge.near', decimals: 8 },
    { chain: 'arb', symbol: 'USDC', assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', decimals: 6 },
    { chain: 'arb', symbol: 'USDT0', assetId: 'nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near', decimals: 6 },
    { chain: 'arb', symbol: 'ETH', assetId: 'nep141:arb.omft.near', decimals: 18 },
    { chain: 'arb', symbol: 'WETH', assetId: 'nep141:arb-0x82af49447d8a07e3bd95bd0d56f35241523fbab1.omft.near', decimals: 18 },
    { chain: 'arb', symbol: 'ARB', assetId: 'nep141:arb-0x912ce59144191c1204e64559fe8253a0e49e6548.omft.near', decimals: 18 },
    { chain: 'op', symbol: 'USDC', assetId: 'nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ', decimals: 6 },
    { chain: 'op', symbol: 'USDT', assetId: 'nep245:v2_1.omni.hot.tg:10_359RPSJVdTxwTJT9TyGssr2rFoWo', decimals: 6 },
    { chain: 'op', symbol: 'ETH', assetId: 'nep245:v2_1.omni.hot.tg:10_11111111111111111111', decimals: 18 },
    { chain: 'op', symbol: 'WETH', assetId: 'nep245:v2_1.omni.hot.tg:10_vLAiSt9KfUGKpw5cD3vsSyNYBn5', decimals: 18 },
    { chain: 'op', symbol: 'OP', assetId: 'nep245:v2_1.omni.hot.tg:10_vLAiSt9KfUGKpw5cD3vsSyNYBo7', decimals: 18 },
    { chain: 'bsc', symbol: 'USDC', assetId: 'nep141:bnb-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omdep.near', decimals: 18 },
    { chain: 'bsc', symbol: 'USDT', assetId: 'nep141:bnb-0x55d398326f99059ff775485246999027b3197955.omdep.near', decimals: 18 },
    { chain: 'bsc', symbol: 'BNB', assetId: 'nep141:bnb.omdep.near', decimals: 18 },
    { chain: 'bsc', symbol: 'NEAR', assetId: 'nep141:bnb-0x1fa4a73a3f0133f0025378af00236f3abdee5d63.omdep.near', decimals: 18 },
    { chain: 'avax', symbol: 'USDC', assetId: 'nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omdep.near', decimals: 6 },
    { chain: 'avax', symbol: 'USDT', assetId: 'nep141:avax-0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7.omdep.near', decimals: 6 },
    { chain: 'avax', symbol: 'AVAX', assetId: 'nep141:avax.omdep.near', decimals: 18 },
    { chain: 'gnosis', symbol: 'USDC', assetId: 'nep141:gnosis-0x2a22f9c3b484c3629090feed35f17ff8f88f76f0.omft.near', decimals: 6 },
    { chain: 'gnosis', symbol: 'USDT', assetId: 'nep141:gnosis-0x4ecaba5870353805a9f068101a40e0f32ed605c6.omft.near', decimals: 6 },
    { chain: 'gnosis', symbol: 'xDAI', assetId: 'nep141:gnosis.omft.near', decimals: 18 },
    { chain: 'gnosis', symbol: 'GNO', assetId: 'nep141:gnosis-0x9c58bacc331c9aa871afd802db6379a98e80cedb.omft.near', decimals: 18 },
    { chain: 'gnosis', symbol: 'WETH', assetId: 'nep141:gnosis-0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1.omft.near', decimals: 18 },
    { chain: 'pol', symbol: 'USDC', assetId: 'nep141:pol-0x3c499c542cef5e3811e1192ce70d8cc03d5c3359.omdep.near', decimals: 6 },
    { chain: 'pol', symbol: 'USDT', assetId: 'nep141:pol-0xc2132d05d31c914a87c6611c10748aeb04b58e8f.omdep.near', decimals: 6 },
    { chain: 'pol', symbol: 'POL', assetId: 'nep141:pol.omdep.near', decimals: 18 },
    { chain: 'pol', symbol: 'WETH', assetId: 'nep141:pol-0x7ceb23fd6bc0add59e62ac25578270cff1b9f619.omdep.near', decimals: 18 },
    { chain: 'sol', symbol: 'USDC', assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', decimals: 6 },
    { chain: 'sol', symbol: 'USDT', assetId: 'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near', decimals: 6 },
    { chain: 'sol', symbol: 'SOL', assetId: 'nep141:sol.omft.near', decimals: 9 },
    { chain: 'sol', symbol: 'wNEAR', assetId: '1cs_v1:sol:spl:3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG', decimals: 9 },
    { chain: 'hood', symbol: 'ETH', assetId: 'nep141:hood.omft.near', decimals: 18 },
    { chain: 'hood', symbol: 'WETH', assetId: 'nep141:hood-0x0bd7d308f8e1639fab988df18a8011f41eacad73.omft.near', decimals: 18 },
    { chain: 'hood', symbol: 'USDG', assetId: 'nep141:hood-0x5fc5360d0400a0fd4f2af552add042d716f1d168.omft.near', decimals: 6 },
    { chain: 'hood', symbol: 'USDe', assetId: 'nep141:hood-0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34.omft.near', decimals: 18 },
  ];
  var TOKEN_BY_ID = {};
  TOKENS.forEach(function (t) { TOKEN_BY_ID[t.assetId] = t; });
  function tokenByAssetId(id) { return TOKEN_BY_ID[id] || null; }

  /* The 7 original curated routes, kept as quick-pick chips, plus one
     Robinhood route added 2026-11-14 (USDC Eth → USDG Hood). */
  var QUICK = [
    { label: 'USDC Eth → Base', from: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', to: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', usd: '1' },
    { label: 'USDC Base → Eth', from: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', to: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', usd: '1' },
    { label: 'USDC Eth → NEAR', from: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', to: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', usd: '1' },
    { label: 'USDC Base → NEAR', from: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', to: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', usd: '1' },
    { label: 'NEAR → USDC Base', from: 'nep141:wrap.near', to: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', usd: '1' },
    { label: 'ETH → USDC Base', from: 'nep141:eth.omft.near', to: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', usd: '2' },
    { label: 'USDC Base → NEAR', from: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', to: 'nep141:wrap.near', usd: '1' },
    { label: 'USDC Eth → USDG Hood', from: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', to: 'nep141:hood-0x5fc5360d0400a0fd4f2af552add042d716f1d168.omft.near', usd: '1' },
  ];

  var state = {
    from: tokenByAssetId('nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near'), // USDC on Ethereum
    to: tokenByAssetId('nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near'), // USDC on Base
    amountMode: 'usd', // 'usd' | 'token' — default $ mode, as asked
    prices: {},         // assetId -> live USD price (from GET /v0/tokens)
    pricesLoaded: false,
    pricesAttempted: false,
    menuFor: null,      // 'from' | 'to' while the token menu is open
    dryQuote: null,     // last dry (price-only) quote response
    liveQuote: null,    // last live quote response (has depositAddress)
    pollTimer: null,
    tracking: null,     // depositAddress currently being polled
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
  var SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  function validAddress(addr, chain) {
    if (!addr) return false;
    var kind = CHAINS[chain].kind;
    if (kind === 'evm') return EVM_RE.test(addr.trim());
    if (kind === 'sol') return SOL_RE.test(addr.trim());
    var a = addr.trim();
    return (a.length >= 2 && a.length <= 64 && NEAR_RE.test(a)) || NEAR_HEX_RE.test(a);
  }
  function addrPlaceholder(chain) {
    var kind = CHAINS[chain].kind;
    if (kind === 'evm') return '0x… (e.g. your wallet address)';
    if (kind === 'sol') return 'Solana address (base58, e.g. your wallet address)';
    return 'name.near (e.g. the recipient’s NEAR account)';
  }
  function looksLikeDepositAddress(addr) {
    var a = (addr || '').trim();
    return EVM_RE.test(a) || SOL_RE.test(a) || NEAR_HEX_RE.test(a) ||
      (a.length >= 2 && a.length <= 64 && NEAR_RE.test(a));
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
  /* When a step changes, bring the new step's card into view — never the
     step navigation at the top of the page. Scrolling to the nav is what
     yanked the page up on every button click. Only move when the card is
     off-screen; if it is already visible, stay exactly where you are. */
  function scrollStepCardIntoView(n) {
    var card = $('card' + n);
    if (!card || typeof card.getBoundingClientRect !== 'function') return;
    var r = card.getBoundingClientRect();
    var vh = (typeof window !== 'undefined' && window.innerHeight) || 0;
    if (r.top >= 0 && r.top < vh) return;
    var top = ((typeof window !== 'undefined' && window.scrollY) || 0) + r.top - 12;
    if (top < 0) top = 0;
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }
  function setStep(n, noScroll) {
    maxStep = Math.max(maxStep, n);
    document.querySelectorAll('.step-nav').forEach(function (el) {
      var s = +el.dataset.step;
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
    });
    for (var i = 1; i <= 5; i++) $('card' + i).classList.toggle('hidden', i > maxStep);
    if (!noScroll) scrollStepCardIntoView(n);
  }

  /* ---------- prices (GET /v0/tokens) ---------- */
  function priceOf(tok) {
    var p = state.prices[tok.assetId];
    return (typeof p === 'number' && p > 0) ? p : null;
  }
  async function loadPrices() {
    try {
      var res = await fetchWithTimeout(API + '/v0/tokens');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var list = await res.json();
      if (Array.isArray(list)) {
        list.forEach(function (x) {
          if (x && x.assetId && typeof x.price === 'number' && x.price > 0) state.prices[x.assetId] = x.price;
        });
        state.pricesLoaded = true;
      }
    } catch (e) {
      state.pricesLoaded = false;
    }
    state.pricesAttempted = true;
    refreshModeAvailability();
    if (state.menuFor) renderMenu($('tokenSearch').value);
  }

  /* ---------- amount: $ mode vs token mode ---------- */
  /* Token amount (human units) implied by the input, whatever mode it is in. */
  function tokenAmountStr() {
    var raw = $('amount').value.trim();
    if (!/^\d+(\.\d+)?$/.test(raw)) return null;
    if (state.amountMode === 'token') return raw;
    var p = priceOf(state.from);
    if (!p) return null;
    var v = parseFloat(raw) / p;
    if (!isFinite(v) || v <= 0) return null;
    var s = v.toFixed(Math.min(state.from.decimals, 8)).replace(/0+$/, '').replace(/\.$/, '');
    return s === '' || s === '0' ? null : s;
  }
  /* Dollar value implied by the input, whatever mode it is in. */
  function usdValueStr() {
    var raw = $('amount').value.trim();
    if (!/^\d+(\.\d+)?$/.test(raw)) return null;
    if (state.amountMode === 'usd') return raw;
    var p = priceOf(state.from);
    if (!p) return null;
    var v = parseFloat(raw) * p;
    if (!isFinite(v) || v < 0) return null;
    return String(v);
  }
  function updateAmountUI() {
    var tok = state.from;
    var p = priceOf(tok);
    var sub = $('amountSub');
    var raw = $('amount').value.trim();
    var validNum = /^\d+(\.\d+)?$/.test(raw);
    $('modeToken').textContent = tok.symbol;
    if (state.amountMode === 'usd') {
      $('curPrefix').textContent = '$';
      $('modeUsd').classList.add('active');
      $('modeToken').classList.remove('active');
      if (p && validNum) {
        var t = tokenAmountStr();
        sub.textContent = t ? ('≈ ' + t + ' ' + tok.symbol + ' on ' + CHAINS[tok.chain].label) : '≈ —';
      } else if (!p) {
        sub.textContent = state.pricesAttempted
          ? 'No live price for ' + tok.symbol + ' — switch to token amount.'
          : 'Loading live price…';
      } else {
        sub.textContent = '≈ — ' + tok.symbol;
      }
    } else {
      $('curPrefix').textContent = '';
      $('modeToken').classList.add('active');
      $('modeUsd').classList.remove('active');
      if (p && validNum) {
        sub.textContent = '≈ ' + fmtUsd(parseFloat(raw) * p) + ' · ' + tok.symbol + ' on ' + CHAINS[tok.chain].label;
      } else if (!p) {
        sub.textContent = state.pricesAttempted
          ? tok.symbol + ' on ' + CHAINS[tok.chain].label + ' (no live price)'
          : 'Loading live price…';
      } else {
        sub.textContent = '≈ —';
      }
    }
  }
  function refreshModeAvailability() {
    var hasPrice = !!priceOf(state.from);
    if (!state.pricesAttempted) { $('modeUsd').disabled = false; $('priceNote').textContent = ''; updateAmountUI(); return; }
    $('modeUsd').disabled = !hasPrice;
    if (!hasPrice) {
      state.amountMode = 'token';
      $('priceNote').textContent = state.pricesLoaded
        ? 'No live price for ' + state.from.symbol + ' — enter the token amount.'
        : 'Live prices are unavailable right now — enter the token amount instead of dollars.';
    } else {
      $('priceNote').textContent = '';
    }
    updateAmountUI();
  }
  function setAmountMode(mode) {
    if (mode === 'usd' && !priceOf(state.from)) return; // cannot convert without a price
    if (mode === state.amountMode) { updateAmountUI(); return; }
    var raw = $('amount').value.trim();
    if (mode === 'token') {
      var t = tokenAmountStr();
      if (t) $('amount').value = t;
    } else {
      var u = usdValueStr();
      if (u !== null) {
        var n = parseFloat(u);
        $('amount').value = isFinite(n) ? String(Math.round(n * 100) / 100) : u;
      }
    }
    state.amountMode = mode;
    updateAmountUI();
    saveState();
  }
  $('modeUsd').onclick = function () { setAmountMode('usd'); };
  $('modeToken').onclick = function () { setAmountMode('token'); };
  $('amount').addEventListener('input', function () {
    updateAmountUI();
    resetToEstimate();
    saveState();
  });
  $('refundTo').addEventListener('input', saveState);
  $('recipient').addEventListener('input', saveState);

  /* ---------- token selection: two panels + dropdown menu ---------- */
  function resetToEstimate() {
    $('toAmount').textContent = '$0.00';
    $('toAmountSub').textContent = '≈ 0 — get a quote in step 3';
  }
  function applySelection() {
    var f = state.from, t = state.to;
    $('fromChain').textContent = CHAINS[f.chain].label;
    $('fromTokenSym').textContent = f.symbol;
    $('toChain').textContent = CHAINS[t.chain].label;
    $('toTokenSym').textContent = t.symbol;
    $('refundTo').placeholder = addrPlaceholder(f.chain);
    $('refundHint').textContent = 'If the swap fails, the ' + f.symbol + ' comes back to this address on ' +
      CHAINS[f.chain].label + '.';
    $('destSummary').textContent = t.symbol + ' on ' + CHAINS[t.chain].label;
    $('recipient').placeholder = addrPlaceholder(t.chain);
    $('recipientHint').textContent = 'Double-check this — a swap sent to the wrong address on ' +
      CHAINS[t.chain].label + ' cannot be undone.';
    refreshModeAvailability();
    resetToEstimate();
    updateQuickChips();
    state.dryQuote = null; state.liveQuote = null;
    $('quoteResult').classList.add('hidden');
    $('depositResult').classList.add('hidden');
    hideStatus('status3'); hideStatus('status4');
    saveState();
  }
  function selectToken(which, tok) {
    var other = which === 'from' ? 'to' : 'from';
    if (tok.assetId === state[other].assetId) {
      state[other] = state[which]; // picking the same token on both sides swaps them instead
    }
    state[which] = tok;
    closeMenu();
    applySelection();
  }
  function renderMenu(filter) {
    var list = $('tokenList');
    list.textContent = '';
    var f = (filter || '').trim().toLowerCase();
    var shown = 0;
    CHAIN_ORDER.forEach(function (chain) {
      var items = TOKENS.filter(function (t) { return t.chain === chain; })
        .filter(function (t) {
          return !f || t.symbol.toLowerCase().indexOf(f) >= 0 ||
            CHAINS[chain].label.toLowerCase().indexOf(f) >= 0;
        });
      if (!items.length) return;
      var g = document.createElement('div');
      g.className = 'token-group';
      g.textContent = CHAINS[chain].label;
      list.appendChild(g);
      items.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'token-item'; b.setAttribute('role', 'option');
        var sel = state[state.menuFor] && state[state.menuFor].assetId === t.assetId;
        if (sel) b.classList.add('selected');
        var sym = document.createElement('span'); sym.className = 'sym';
        sym.textContent = (sel ? '✓ ' : '') + t.symbol;
        var ch = document.createElement('span'); ch.className = 'chain';
        ch.textContent = CHAINS[chain].label;
        var pr = document.createElement('span'); pr.className = 'price';
        var p = priceOf(t);
        pr.textContent = p ? fmtUsd(p) : '—';
        b.appendChild(sym); b.appendChild(ch); b.appendChild(pr);
        b.onclick = function () { selectToken(state.menuFor, t); };
        list.appendChild(b);
        shown++;
      });
    });
    if (!shown) {
      var none = document.createElement('div');
      none.className = 'token-group';
      none.textContent = 'No tokens match that search.';
      list.appendChild(none);
    }
  }
  function openMenu(which, btn) {
    state.menuFor = which;
    renderMenu('');
    $('tokenSearch').value = '';
    var menu = $('tokenMenu');
    menu.classList.remove('hidden');
    try {
      var top = btn.offsetTop + btn.offsetHeight + 8;
      menu.style.top = top + 'px';
    } catch (e) {}
    $(which === 'from' ? 'fromTokenBtn' : 'toTokenBtn').setAttribute('aria-expanded', 'true');
    /* Focus the search without moving the page — a plain focus() scrolls
       the input into view, which yanked the page up when the menu opened. */
    try { $('tokenSearch').focus({ preventScroll: true }); }
    catch (e) { $('tokenSearch').focus(); }
  }
  function closeMenu() {
    state.menuFor = null;
    $('tokenMenu').classList.add('hidden');
    $('fromTokenBtn').setAttribute('aria-expanded', 'false');
    $('toTokenBtn').setAttribute('aria-expanded', 'false');
  }
  function toggleMenu(which, btn) {
    if (state.menuFor === which) closeMenu();
    else openMenu(which, btn);
  }
  $('fromTokenBtn').onclick = function (e) { e.stopPropagation(); toggleMenu('from', this); };
  $('toTokenBtn').onclick = function (e) { e.stopPropagation(); toggleMenu('to', this); };
  $('tokenSearch').addEventListener('input', function () { renderMenu(this.value); });
  document.addEventListener('click', function (e) {
    if (!state.menuFor) return;
    var t = e.target;
    if (t.closest && t.closest('#tokenMenu, #fromTokenBtn, #toTokenBtn')) return;
    closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.menuFor) closeMenu();
  });
  $('btnSwap').onclick = function () {
    var tmp = state.from; state.from = state.to; state.to = tmp;
    applySelection();
  };

  /* ---------- quick-pick chips (the 7 original curated routes) ---------- */
  var chipsBox = $('quickChips');
  QUICK.forEach(function (q) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chip';
    b.textContent = q.label;
    b.onclick = function () {
      state.from = tokenByAssetId(q.from);
      state.to = tokenByAssetId(q.to);
      state.amountMode = 'usd';
      $('amount').value = q.usd;
      applySelection();
    };
    chipsBox.appendChild(b);
  });
  function updateQuickChips() {
    var btns = chipsBox.querySelectorAll('.chip');
    QUICK.forEach(function (q, i) {
      if (btns[i]) btns[i].classList.toggle('active', q.from === state.from.assetId && q.to === state.to.assetId);
    });
  }

  /* ---------- validation ---------- */
  function validateStep1() {
    var ok = true;
    var amtTok = tokenAmountStr();
    var amtBase = amtTok ? toBaseUnits(amtTok, state.from.decimals) : null;
    var panel = $('fromPanel'), err = $('amountErr');
    if (!amtBase || amtBase === '0') {
      panel.classList.add('invalid');
      err.textContent = 'Enter an amount greater than 0.';
      err.style.display = 'block';
      ok = false;
    } else if (state.from.assetId === state.to.assetId) {
      panel.classList.add('invalid');
      err.textContent = 'Pick a different token or chain for the destination.';
      err.style.display = 'block';
      ok = false;
    } else {
      panel.classList.remove('invalid');
      err.style.display = 'none';
    }
    var refund = $('refundTo').value.trim();
    var refundField = $('refundField');
    if (!validAddress(refund, state.from.chain)) { refundField.classList.add('invalid'); ok = false; }
    else refundField.classList.remove('invalid');
    if (!ok) showStatus('status1', 'err', 'Check the fields above.', 'The amount must be greater than 0 and the refund address must match the origin chain.');
    else hideStatus('status1');
    return ok;
  }
  function validateStep2() {
    var ok = true;
    var rec = $('recipient').value.trim();
    var f = $('recipientField');
    if (!validAddress(rec, state.to.chain)) { f.classList.add('invalid'); ok = false; }
    else f.classList.remove('invalid');
    if (!ok) showStatus('status2', 'err', 'That recipient address does not look right.', 'It must be an address on ' + CHAINS[state.to.chain].label + '.');
    else hideStatus('status2');
    return ok;
  }

  /* ---------- 1-Click API ---------- */
  function quoteBody(dry) {
    var amountBase = toBaseUnits(tokenAmountStr(), state.from.decimals);
    return {
      dry: dry,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: state.from.assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: state.to.assetId,
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
    var res = await fetchWithTimeout(API + '/v0/quote', {
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
    var res = await fetchWithTimeout(url);
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      var err = new Error(body.message || ('Status check failed (HTTP ' + res.status + ').'));
      err.httpStatus = res.status;
      throw err;
    }
    return body;
  }
  /* Friendly wording when the API simply cannot price a pair. */
  function pairError(e) {
    var msg = String(e && e.message || e);
    if (/quot|route|liquid|pair|not found|not supported|no swap|insufficient|amount/i.test(msg)) {
      return { title: 'This pair is not available.', hint: 'NEAR Intents could not price it — try another token or chain. Details: ' + msg };
    }
    return { title: 'Could not get a quote.', hint: msg };
  }

  /* ---------- step flow ---------- */
  $('btnNext1').onclick = function () { if (validateStep1()) setStep(2); };
  $('btnBack2').onclick = function () { setStep(1); };
  $('btnNext2').onclick = function () { if (validateStep2()) { setStep(3); $('btnQuote').click(); } };

  function renderQuote(q) {
    var out = q.quote;
    $('qSend').textContent = out.amountInFormatted + ' ' + state.from.symbol + ' (' + fmtUsd(out.amountInUsd) + ')';
    $('qReceive').textContent = out.amountOutFormatted + ' ' + state.to.symbol + ' (' + fmtUsd(out.amountOutUsd) + ')';
    $('qMinOut').textContent = fromBaseUnits(out.minAmountOut, state.to.decimals) + ' ' + state.to.symbol + ' (worst case at 1% slippage)';
    var rate = parseFloat(out.amountOutFormatted) / parseFloat(out.amountInFormatted);
    $('qRate').textContent = isFinite(rate)
      ? '1 ' + state.from.symbol + ' ≈ ' + rate.toPrecision(4) + ' ' + state.to.symbol
      : '—';
    $('qTime').textContent = fmtSeconds(out.timeEstimate);
    var refundFee = out.refundFee ? fromBaseUnits(out.refundFee, state.from.decimals) + ' ' + state.from.symbol + ' (only if refunded)' : '—';
    var withdrawFee = out.withdrawFee ? fromBaseUnits(out.withdrawFee, state.to.decimals) + ' ' + state.to.symbol : '—';
    $('qFees').textContent = 'Withdraw: ' + withdrawFee + ' · Refund: ' + refundFee + ' (as reported by the quote)';
    $('qRef').textContent = q.correlationId || '—';
    $('quoteResult').classList.remove('hidden');
    /* Also fill the "To" panel with the quoted receive amount. */
    $('toAmount').textContent = fmtUsd(out.amountOutUsd);
    $('toAmountSub').textContent = '≈ ' + out.amountOutFormatted + ' ' + state.to.symbol + ' on ' + CHAINS[state.to.chain].label;
  }

  $('btnQuote').onclick = async function () {
    hideStatus('status3');
    var btn = $('btnQuote');
    btn.disabled = true; btn.textContent = 'Asking solvers…';
    try {
      var q = await requestQuote(true);
      state.dryQuote = q;
      renderQuote(q);
      saveState();
      showStatus('status3', 'ok', 'Live quote ready.',
        'This price is real and free — nothing has moved. Create a deposit address when you are happy with it.');
    } catch (e) {
      var pe = pairError(e);
      showStatus('status3', 'err', pe.title, pe.hint);
    } finally {
      btn.disabled = false; btn.textContent = 'Get quote';
    }
  };
  $('btnRefreshQuote').onclick = function () { $('btnQuote').click(); };

  /* Fill the deposit card from a live quote — used both when the quote is
     first created and when a saved swap is restored after a refresh. */
  function renderDeposit(q) {
    var out = q.quote;
    $('dAmount').textContent = out.amountInFormatted + ' ' + state.from.symbol;
    $('dToken').textContent = state.from.symbol + ' on ' + CHAINS[state.from.chain].label + ' — and nothing else';
    $('dDeadline').textContent = fmtDate(out.deadline) + ' (deposit address expires then)';
    $('dAddress').textContent = out.depositAddress;
    if (out.depositMemo) {
      $('dMemo').textContent = out.depositMemo;
      $('dMemoRow').style.display = 'block';
    } else $('dMemoRow').style.display = 'none';
    $('depositResult').classList.remove('hidden');
  }
  /* One text block with everything needed to recover a swap — used by both
     "Copy all details" and "Download receipt". */
  function swapDetailsText() {
    var q = state.liveQuote && state.liveQuote.quote;
    if (!q) return null;
    var trackUrl = pageBaseUrl() + '?track=' + encodeURIComponent(q.depositAddress);
    var lines = [
      'NearRemit — swap details (save this before you send)',
      'Send exactly: ' + q.amountInFormatted + ' ' + state.from.symbol + ' on ' + CHAINS[state.from.chain].label,
      'Deposit address: ' + q.depositAddress,
    ];
    if (q.depositMemo) lines.push('Memo: ' + q.depositMemo);
    lines.push(
      'Recipient gets: ' + q.amountOutFormatted + ' ' + state.to.symbol + ' on ' + CHAINS[state.to.chain].label,
      'Recipient address: ' + $('recipient').value.trim(),
      'Refund address: ' + $('refundTo').value.trim(),
      'Valid until: ' + fmtDate(q.deadline),
      'Quote ref: ' + (state.liveQuote.correlationId || ''),
      'Track it: ' + trackUrl,
      'Demo: ' + pageBaseUrl()
    );
    return lines.join('\n');
  }

  $('btnDeposit').onclick = async function () {
    hideStatus('status4');
    var btn = $('btnDeposit');
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
      var q = await requestQuote(false);
      state.liveQuote = q;
      renderDeposit(q);
      setStep(4);
      saveState();
      showStatus('status4', 'ok', 'Deposit address ready.',
        'Send exactly ' + q.quote.amountInFormatted + ' ' + state.from.symbol + ' on ' + CHAINS[state.from.chain].label + ' to it. The swap starts when the deposit lands.');
    } catch (e) {
      var pe = pairError(e);
      showStatus('status4', 'err', pe.title, pe.hint);
    } finally {
      btn.disabled = false; btn.textContent = 'Create deposit address →';
    }
  };
  $('btnCopyDeposit').onclick = function (e) { copyText($('dAddress').textContent, e.currentTarget, 'Copy'); };
  $('btnCopyDetails').onclick = function (e) {
    var text = swapDetailsText();
    if (!text) return;
    copyText(text, e.currentTarget, 'Copy all details');
  };
  $('btnReceipt').onclick = function (e) {
    var text = swapDetailsText();
    if (!text) return;
    var addr = state.liveQuote.quote.depositAddress || 'swap';
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'nearremit-receipt-' + addr.slice(0, 10) + '.txt';
    document.body.appendChild(a);
    a.click();
    var btn = e.currentTarget;
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    if (btn) { btn.textContent = 'Downloaded ✓'; setTimeout(function () { btn.textContent = 'Download receipt'; }, 1600); }
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
        addTxLink(links, 'Origin tx: ', h, CHAINS[state.from.chain].explorer);
      });
      (sd.destinationChainTxHashes || []).forEach(function (h) {
        addTxLink(links, 'Destination tx: ', h, CHAINS[state.to.chain].explorer);
      });
      if (sd.amountOutFormatted) {
        var p = document.createElement('div');
        p.textContent = 'Delivered: ' + sd.amountOutFormatted + ' ' + state.to.symbol +
          (sd.amountOutUsd ? ' (' + fmtUsd(sd.amountOutUsd) + ')' : '');
        links.appendChild(p);
      }
      if (sd.refundedAmountFormatted && sd.refundedAmountFormatted !== '0') {
        var pr = document.createElement('div');
        pr.textContent = 'Refunded: ' + sd.refundedAmountFormatted + ' ' + state.from.symbol +
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
    var box = state.trackStatusId || 'status5';
    try {
      /* Only send the saved memo when tracking the live quote's own
         deposit address — a looked-up address has no memo of ours. */
      var memo = (state.liveQuote && state.liveQuote.quote &&
        state.liveQuote.quote.depositAddress === state.tracking)
        ? state.liveQuote.quote.depositMemo : null;
      var res = await fetchStatus(state.tracking, memo);
      var done = renderTracker(res.status, res);
      if (done) {
        stopPolling();
        saveState();
        if (res.status === 'SUCCESS') showStatus(box, 'ok', 'Delivered.', 'The recipient got the money. Links above go to the chain explorers.');
        else if (res.status === 'REFUNDED') showStatus(box, 'warn', 'Refunded.', 'The swap did not complete — the deposit went back to your refund address, minus the refund fee.');
        else showStatus(box, 'err', 'Swap failed.', 'Check the details above; the deposit should be refunded to your address.');
      }
    } catch (e) {
      if (e && e.httpStatus === 404) {
        /* No swap exists for this address — retrying forever cannot help.
           The usual cause is pasting your own wallet address instead of
           the deposit address the page gave you in step 4. Stop polling
           and say so plainly, in the box the lookup came from. */
        stopPolling();
        saveState();
        showStatus(box, 'err', 'No swap found for this address.',
          'Check you pasted the deposit address from step 4 — the one the page gave you after "Create deposit address" — not your own wallet address. A wallet address has no swap attached to it.');
      } else {
        showStatus(box, 'err', 'Status check failed.', String(e && e.message || e) + ' — retrying automatically.');
      }
    }
  }
  function startTracking(depositAddress, noScroll, statusId) {
    stopPolling();
    state.tracking = depositAddress;
    state.trackStatusId = statusId || 'status5';
    setStep(5, noScroll);
    $('trackState').textContent = 'Status: checking…';
    pollOnce();
    state.pollTimer = setInterval(pollOnce, 10000);
    saveState();
  }
  $('btnTrack').onclick = function () {
    var q = state.liveQuote && state.liveQuote.quote;
    if (q && q.depositAddress) startTracking(q.depositAddress);
  };
  /* One lookup path for both the step-5 field and the prominent box at the
     top of the page — paste a deposit address, see its status. */
  function checkSwapAddress(addr, statusId) {
    var a = (addr || '').trim();
    if (!looksLikeDepositAddress(a)) {
      showStatus(statusId, 'err', 'That is not a deposit address.', 'Deposit addresses look like a 0x address, a Solana address, or a NEAR account.');
      return false;
    }
    hideStatus(statusId);
    startTracking(a, false, statusId);
    return true;
  }
  $('btnLookup').onclick = function () { checkSwapAddress($('lookupAddr').value, 'status5'); };
  $('btnLookupHero').onclick = function () { checkSwapAddress($('lookupHeroAddr').value, 'statusHero'); };
  $('btnStopTrack').onclick = function () {
    stopPolling();
    saveState();
    showStatus('status5', 'warn', 'Tracking stopped.', 'Paste the deposit address above any time to check again.');
  };

  /* ---------- init ---------- */
  applySelection();
  setStep(1, true);
  restoreSavedState();
  loadPrices();
  persistReady = true;
  saveState();
  /* Banner buttons: keep going where the restored swap left off, or wipe
     the saved swap and start clean. */
  $('btnResumeContinue').onclick = function () {
    $('resumeBanner').classList.add('hidden');
    scrollStepCardIntoView(maxStep);
  };
  $('btnStartOver').onclick = clearSavedSwap;
  /* Deep link: ?track=<depositAddress> opens the tracker for that swap
     (the link printed in the downloaded receipt). */
  var trackParam = urlParam('track');
  if (trackParam && looksLikeDepositAddress(trackParam) && trackParam !== state.tracking) {
    $('lookupHeroAddr').value = trackParam;
    checkSwapAddress(trackParam, 'statusHero');
  }
  window.addEventListener('beforeunload', saveState);
})();
