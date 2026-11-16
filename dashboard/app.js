// Launch Radar's dashboard (model radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, search and filters (category, chain, scope, minimum TVL),
// sortable columns, a live-token comparison tab, and a per-protocol detail drawer whose model
// breakdown and farm plan are recomputed here from the same figures main.ts scored. No network.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', scope: 'all', minTvl: 0, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures (TVL, the peer
  // multiple the snapshot's live protocols set, seven-day growth, age) and checks board.json's number.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the gas, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 12;
    if (c.indexOf('solana') >= 0 || c.indexOf('base') >= 0 || c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('polygon') >= 0 || c.indexOf('bsc') >= 0 || c.indexOf('binance') >= 0) return 1;
    if (c.indexOf('avalanche') >= 0 || c.indexOf('fantom') >= 0 || c.indexOf('sonic') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('scroll') >= 0 || c.indexOf('mantle') >= 0 || c.indexOf('blast') >= 0) return 2;
    return 3;
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the supply on ' + name + ', repay it a week later, and keep the supply in place.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return "Make one swap through " + name + "'s own interface on " + chain + ' so the wallet records both trading and liquidity activity.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount back through ' + name + ' so the wallet shows traffic in both directions.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim or compound the staking rewards on ' + name + ' once, and keep the receipt token in the wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + name + ', then open one more small trade in a later week so the history is not a single day.';
    if (c.indexOf('prediction') >= 0) return 'Settle the first position on ' + name + ' and place one more on a different market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Add a second, smaller deposit to the same ' + name + ' vault in a later week.';
    if (c.indexOf('stable') >= 0) return 'Use the minted stable asset in one ' + name + ' partner market on ' + chain + ', then return it to the wallet.';
    if (c.indexOf('rwa') >= 0) return 'Redeem a small part of the ' + name + ' position once, then mint it back, so both directions are on record.';
    if (c.indexOf('insurance') >= 0) return 'Renew or extend the ' + name + ' cover once before it lapses.';
    return 'Make one more deposit or swap inside ' + name + ' on ' + chain + ' in a later week, from the same wallet.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var gas = gasFor(chain);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm ' + p.name + ' with, and keep its seed phrase offline.', cost: 'under $' + (gas + 2) + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: "Open " + p.name + "'s own site from its official listing, check for a points or rewards page, and note what it counts before you deposit anything.", cost: 'nothing to read, and never pay anyone to be whitelisted', time: '20 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas on ' + chain, time: '15 minutes to set up' },
      { text: secondActionFor(p, chain), cost: 'about $' + gas + ' of gas on ' + chain + ', with no new capital', time: '10 minutes, in the second week' },
      { text: 'Repeat one qualifying action on ' + p.name + ' every week, such as a deposit, a borrow, a swap or a vote, always from the same wallet.', cost: 'about $' + gas + ' of gas a week on ' + chain, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one weekly snapshot.', cost: 'the $' + capital + ' stays in the position for the whole hold', time: hold + ' days' },
      { text: 'Keep a farm log with the wallet, the dates and every transaction hash, and claim any reward only from the link ' + p.name + ' itself publishes.', cost: 'nothing but the log, and never a fee to claim', time: '5 minutes a week, 15 minutes to unwind at the end' }
    ].map(stepText);
  }
  // The whole plan's cash cost, from the same figures: the capital, plus gas for the setup, the
  // second action and one action a week over the hold.
  function planCost(p) {
    var gas = gasFor(chainOf(p));
    var weeks = Math.max(1, Math.ceil(holdDaysFor(p.age_days) / 7));
    return { capital: capitalFor(p), gasTotal: (gas + 2) + gas + gas * weeks, weeks: weeks, hold: holdDaysFor(p.age_days) };
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('scope')) state.scope = params.get('scope');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.scope === 'watch' && !r.in_watchlist) return false;
      if (state.scope === 'early' && r.in_watchlist) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.peer_multiple; bv = b.peer_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Launch Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', { html: '' },
          'Every protocol that records no token, ranked by what its launch would be worth if its record stayed as it is. The ',
          el('b', { text: DATA.watchlist_size + ' watchlist protocols' }),
          ' are the floor, not the ceiling: the radar also scores ',
          el('b', { text: DATA.early_size + ' early protocols' }),
          ' below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor. Implied value is this board\u2019s own model, never a promise, and it never predicts that a token will come.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global peer multiple' }), el('b', { text: DATA.global_multiple.toFixed(2) + 'x TVL' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function selectField(id, label, options, value, onChange) {
    var select = el('select', { id: id, 'aria-label': label },
      options.map(function (o) { return el('option', { value: String(o.value), text: o.text, selected: String(o.value) === String(value) ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { onChange(select.value); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), select);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 18);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('category', 'Category', [{ value: 'all', text: 'All categories' }].concat(categories.map(function (c) { return { value: c, text: c }; })), state.category, function (v) { state.category = v; writeHash(); render(); }),
      selectField('chain', 'Chain', [{ value: 'all', text: 'All chains' }].concat(chains.map(function (c) { return { value: c, text: c }; })), state.chain, function (v) { state.chain = v; writeHash(); render(); }),
      selectField('scope', 'Scope', [
        { value: 'all', text: 'Whole radar' },
        { value: 'watch', text: 'Watchlist only' },
        { value: 'early', text: 'Early only (below the floor)' }
      ], state.scope, function (v) { state.scope = v; writeHash(); render(); }),
      selectField('mintvl', 'Minimum TVL', [
        { value: '0', text: 'Any TVL' },
        { value: '10000000', text: '$10M and up' },
        { value: '50000000', text: '$50M and up (the floor)' },
        { value: '250000000', text: '$250M and up' },
        { value: '1000000000', text: '$1B and up' }
      ], String(state.minTvl), function (v) { state.minTvl = Number(v); render(); }),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen a filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.scope = 'all'; state.minTvl = 0; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    if (max <= 0) max = 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', null, r.in_watchlist
          ? el('span', { class: 'badge', text: 'WATCHLIST' })
          : el('span', { class: 'badge early', text: 'EARLY' })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.peer_multiple.toFixed(2) + 'x' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            el('th', { scope: 'col', text: 'Radar' }),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Peer x'),
            sortHeader('implied', 'Implied value')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var ratio = r.mcap_usd !== null && r.tvl_usd > 0 ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a';
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live token: these protocols already trade, so their market cap is a fact, not a model. Their category medians set the peer multiples the pre-token board is valued with; they are never ranked themselves.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Cap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'One function scores every row from the snapshot\u2019s own figures. No protocol name is special-cased and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x peer_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'The peer multiple is the median market-cap / TVL of the live protocols in the same category, shrunk toward the global median (' + DATA.global_multiple.toFixed(2) + 'x here) by peer count and clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + ']; a category with fewer than ' + m.peer_min_peers + ' live peers uses the global median. Age is the time since the protocol was first listed, the record of how long it has run recording no token; an unknown age uses ' + m.unknown_age_days + ' days. Protocols whose token already trades are set aside in the Live token view, never ranked.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var cost = planCost(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.in_watchlist ? ' - watchlist' : ' - early, below the floor') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' - records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('p', { class: 'verdict', text: 'Farm it with $' + cost.capital + ' of capital and about $' + cost.gasTotal + ' of gas over a ' + cost.hold + '-day hold (' + cost.weeks + ' weekly actions). At the model\u2019s ' + fmtUsd(row.implied_value_usd) + ' implied value, this is the board\u2019s rank ' + row.rank + ' place to spend that time.' }));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value, step by step' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Peer multiple (' + (row.peer_count > 0 ? row.peer_count + ' live peers in its category' : 'global median, too few live peers in its category') + ')' }), el('b', { class: 'num', text: row.peer_multiple.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age recording no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate from the snapshot\u2019s figures, not a price and not a forecast that a token will be issued.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
