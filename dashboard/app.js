// Token Launch Radar dashboard. Renders window.RADAR (written by main.ts as
// ../data.js) with no network, no framework and no build step: the board, a
// detail view per protocol, the live-token comparison and the method page.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) return;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n == null) return '—';
    var v = Math.round(n * 10) / 10;
    return (v > 0 ? '+' : '') + v + '%';
  }
  function ageText(days) {
    if (days == null) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 730) return Math.round(days / 30.4) + ' mo';
    return (Math.round(days / 36.5) / 10) + ' yr';
  }

  // Header and headline figures.
  el('stamp').innerHTML = 'Snapshot <b>' + esc(R.as_of) + '</b> · DefiLlama via make.fun<br>Model <b>' +
    esc(R.model_version) + '</b> · global peer multiple <b>' + R.global_multiple + '×</b>';
  el('stats').innerHTML = [
    [R.scanned, 'protocols scanned'],
    [R.pre_token, 'record no token'],
    [R.board_size, 'ranked on the board'],
    [R.watchlist_size + ' / ' + R.watchlist_size, 'watchlist covered'],
    ['<em>' + money(R.rows.length ? R.rows[0].implied_value_usd : 0) + '</em>', 'top implied value'],
  ].map(function (s) {
    return '<div class="stat"><div class="v">' + s[0] + '</div><div class="k">' + s[1] + '</div></div>';
  }).join('');

  // Filter vocabularies, from the data itself.
  var cats = {}, chains = {};
  R.rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    (r.chains || []).forEach(function (c) { chains[c] = 1; });
  });
  el('f-cat').innerHTML = '<option value="">All categories</option>' + Object.keys(cats).sort().map(function (c) {
    return '<option>' + esc(c) + '</option>';
  }).join('');
  el('f-chain').innerHTML = '<option value="">All chains</option>' + Object.keys(chains).sort().map(function (c) {
    return '<option>' + esc(c) + '</option>';
  }).join('');

  var selected = null;

  function visibleRows() {
    var q = el('q').value.trim().toLowerCase();
    var cat = el('f-cat').value, chain = el('f-chain').value, tier = el('f-tier').value;
    var rows = R.rows.filter(function (r) {
      if (cat && r.category !== cat) return false;
      if (chain && (r.chains || []).indexOf(chain) < 0) return false;
      if (tier && r.tier !== tier) return false;
      if (q && (r.name + ' ' + (r.category || '') + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var sort = el('f-sort').value;
    var key = {
      implied: function (r) { return -r.implied_value_usd; },
      tvl: function (r) { return -r.tvl_usd; },
      growth: function (r) { return -(r.change_7d == null ? -999 : r.change_7d); },
      age: function (r) { return -(r.age_days == null ? -1 : r.age_days); },
      multiple: function (r) { return -r.peer_multiple; },
    }[sort];
    return rows.sort(function (a, b) { return key(a) - key(b); });
  }

  function renderBoard() {
    var rows = visibleRows();
    el('count').textContent = rows.length + ' of ' + R.rows.length + ' shown';
    el('rows').innerHTML = rows.map(function (r) {
      var ch = (r.chains || []).slice(0, 3).join(', ') + (r.chains && r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '');
      return '<tr data-slug="' + esc(r.slug) + '"' + (selected === r.slug ? ' class="selected"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="pname">' + esc(r.name) + '</div><div class="pcat">' + esc(r.category || 'Uncategorized') + '</div></td>' +
        '<td class="chains">' + esc(ch || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d == null ? '' : r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num">' + r.peer_multiple + '×</td>' +
        '<td class="num implied">' + money(r.implied_value_usd) + '</td>' +
        '<td><span class="badge ' + r.tier + '">' + (r.tier === 'watchlist' ? 'Watchlist' : 'Early') + '</span></td></tr>';
    }).join('');
    var trs = el('rows').querySelectorAll('tr');
    for (var i = 0; i < trs.length; i++) {
      trs[i].addEventListener('click', function () { select(this.getAttribute('data-slug')); });
    }
    if (!selected && rows.length) select(rows[0].slug, true);
    else if (selected) renderDetail();
  }

  function bar(label, mult, max) {
    var w = Math.max(3, Math.min(100, (mult / max) * 100));
    return '<div class="bar-row"><span class="k">' + label + '</span><span class="bar"><i style="width:' + w + '%"></i></span><span class="v">' + mult + '×</span></div>';
  }

  function select(slug, silent) {
    selected = slug;
    if (!silent) renderBoard(); else renderDetail();
    var trs = el('rows').querySelectorAll('tr');
    for (var i = 0; i < trs.length; i++) {
      if (trs[i].getAttribute('data-slug') === slug) trs[i].classList.add('selected');
    }
  }

  function renderDetail() {
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === selected) r = R.rows[i];
    if (!r) { el('detail').innerHTML = '<p class="empty">Pick a protocol on the board to see its price build-up and farm plan.</p>'; return; }
    var steps = (r.farm_steps || []).map(function (s) {
      var m = s.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.?$/);
      if (!m) return '<li>' + esc(s) + '</li>';
      return '<li>' + esc(m[1]) + '<span class="meta">Cost: ' + esc(m[2]) + ' · Time: ' + esc(m[3]) + '</span></li>';
    }).join('');
    el('detail').innerHTML =
      '<h2>' + esc(r.name) + '</h2>' +
      '<div class="sub">Rank #' + r.rank + ' · ' + esc(r.category || 'Uncategorized') + ' · ' +
      '<span class="badge ' + r.tier + '">' + (r.tier === 'watchlist' ? 'Watchlist' : 'Early find') + '</span></div>' +
      '<div class="big"><small>Implied launch value</small>' + money(r.implied_value_usd) + '</div>' +
      '<div class="kv">' +
      '<div><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div></div>' +
      '<div><div class="k">7d change</div><div class="v">' + pct(r.change_7d) + '</div></div>' +
      '<div><div class="k">Tracked for</div><div class="v">' + ageText(r.age_days) + (r.listed_at ? ' (since ' + esc(r.listed_at) + ')' : '') + '</div></div>' +
      '<div><div class="k">Chains</div><div class="v">' + esc((r.chains || []).join(', ') || '—') + '</div></div>' +
      '</div>' +
      '<h3>How the price is built</h3>' +
      bar('Peer multiple', r.peer_multiple, 1.5) +
      bar('Momentum', r.growth_multiplier, 1.5) +
      bar('Maturity', r.maturity_multiplier, 1.5) +
      bar('Breadth', r.breadth_multiplier, 1.5) +
      '<p class="sub">TVL × peer multiple (from ' + r.peer_count + ' live ' + esc(r.category || '') +
      ' tokens) × momentum × maturity × breadth. No hand-set price for any name.</p>' +
      '<h3>Farm plan</h3><ol class="steps">' + steps + '</ol>';
  }

  // Watch-only strip: the big names the radar refuses to rank.
  el('watchonly').innerHTML = '<h3>Too big to rank, on purpose</h3>' +
    '<p>These record no token either, but each is a product of one that already trades, or an exchange itself. ' +
    'Ranking them would price another protocol\u2019s token twice, so the radar names them and leaves them off the board.</p><ul>' +
    R.watch_only.map(function (w) {
      return '<li><b>' + esc(w.name) + '</b> · ' + money(w.tvl_usd) + ' TVL — ' + esc(w.reason) + '</li>';
    }).join('') + '</ul>';

  // Live view.
  el('live-rows').innerHTML = R.live.map(function (p) {
    var ratio = p.mcap_usd && p.tvl_usd ? (Math.round((p.mcap_usd / p.tvl_usd) * 100) / 100) + '×' : '—';
    return '<tr><td><div class="pname">' + esc(p.name) + '</div></td><td class="pcat">' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + ratio + '</td><td class="num ' + (p.change_7d == null ? '' : p.change_7d >= 0 ? 'up' : 'down') + '">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // Method view.
  var m = R.model;
  el('method').innerHTML =
    '<h2>The model, in the open</h2>' +
    '<p><b>Implied value = TVL × peer multiple × momentum × maturity × breadth.</b> Every figure comes from the ' +
    'sealed snapshot of ' + esc(R.as_of) + ' (' + R.scanned + ' protocols). No name is priced by hand: the function ' +
    '<code>impliedValue</code> in the entry\u2019s <code>lib/model.ts</code> scores every row the same way.</p>' +
    '<h2>1 · Peer multiple</h2><p>For each category, take the live-token protocols in the snapshot and their ' +
    'market-cap / TVL ratios. The category\u2019s multiple is its median, shrunk toward the global median of ' +
    R.global_multiple + '× in log space by a prior of ' + m.shrink_prior + ' protocols, then clamped to [' + m.multiple_floor + ', ' +
    m.multiple_cap + ']. A category with two wild members cannot set a wild price; a category with thirty members speaks for itself.</p>' +
    '<table><tr><th>Category</th><th>Live tokens</th><th>Median cap/TVL</th><th>Multiple used</th></tr>' +
    R.categories.slice(0, 14).map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td>' + c.live_count + '</td><td>' + c.median_multiple + '×</td><td>' + c.used_multiple + '×</td></tr>';
    }).join('') + '</table>' +
    '<h2>2 · Momentum, maturity, breadth</h2><p>Momentum reads the seven-day TVL change, clamped to [' +
    m.growth_floor_pct + '%, +' + m.growth_cap_pct + '%] and weighted ' + m.growth_weight + ', floored so a bad week cannot zero a protocol. ' +
    'Maturity runs from ' + m.maturity_floor + ' to ' + (m.maturity_floor + m.maturity_range) + ' over ' + m.maturity_days +
    ' days tracked with no token: the longer a protocol has run tokenless, the more a launch would be worth. ' +
    'Breadth adds ' + (m.breadth_per_chain * 100) + '% per extra chain, up to ' + m.breadth_max_chains + ' extra chains.</p>' +
    '<h2>3 · Who is not ranked</h2><p>The board is the snapshot\u2019s watchlist in full, plus early protocols below the $' +
    (R.floor_usd / 1e6) + 'M floor that pass the watchlist\u2019s own launchability rule: no token recorded, and not a wrapped, staked or ' +
    'bridged product of a traded token, not an exchange, not a versioned pool. Protocols whose token already trades are never ' +
    'mixed into the ranking; they sit in the Already trading view at the market\u2019s own value.</p>' +
    '<h2>4 · Farm plans</h2><p>Each plan is generated from the protocol\u2019s category, main chain, TVL band and age by ' +
    '<code>farmSteps</code>: a category action (supply, provide, stake, mint, hedge…), a capital tier, a weekly cadence, a hold ' +
    'period and an exit. Costs and times are stated per step, in the detail view of every row.</p>';

  // Controls and tabs.
  ['q', 'f-cat', 'f-chain', 'f-tier', 'f-sort'].forEach(function (id) {
    el(id).addEventListener('input', renderBoard);
    el(id).addEventListener('change', renderBoard);
  });
  var tabBtns = el('tabs').querySelectorAll('button');
  for (var t = 0; t < tabBtns.length; t++) {
    tabBtns[t].addEventListener('click', function () {
      for (var u = 0; u < tabBtns.length; u++) tabBtns[u].classList.remove('active');
      this.classList.add('active');
      ['board', 'live', 'method'].forEach(function (v) {
        el('view-' + v).classList.toggle('hidden', v !== this.getAttribute('data-view'));
      }, this);
    });
  }

  renderBoard();
  renderDetail();
})();
