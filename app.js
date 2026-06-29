(function () {
  "use strict";

  const app = document.getElementById("app");
  const moneyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" });
  const today = new Date().toISOString().slice(0, 10);

  const state = {
    data: null,
    view: "",
    theme: localStorage.getItem("inventory_theme") || "light",
    productQuery: "",
    saleDate: today,
    closureDate: today,
    selectedSaleId: "",
    selectedEntryId: "",
    cart: [],
    catalogCategory: "",
    catalogSubcategory: "",
    stockQuery: "",
    planningMode: "week",
    planningDate: today,
    expanded: new Set(),
    message: "",
  };

  const labels = {
    super_user: "Super user",
    shop_admin: "Responsable shop",
    manager: "Manager",
    agent: "Agent",
    completed: "Conclue",
    pending_admin_approval: "Attente responsable",
    pending_responsable_validation: "Attente responsable",
    rejected: "Rejetée",
    validated: "Validée",
    active: "Active",
    acknowledged: "Vue",
    cleared: "Ignorée",
    resolved: "Résolue",
    not_configured: "Non configurée",
    success: "Succès",
    failed: "Échec",
  };

  const nav = {
    super_user: [
      ["super_shops", "Shops"],
      ["super_users", "Users"],
      ["super_settings", "Paramètres"],
      ["super_logs", "Logs"],
      ["faq", "FAQ"],
    ],
    shop_admin: [
      ["dashboard", "Dashboard"],
      ["sales", "Ventes"],
      ["stock", "Stock"],
      ["catalog", "Catalogue"],
      ["promotions", "Promotions"],
      ["validations", "Validations"],
      ["team", "Équipe"],
      ["planning", "Planning"],
      ["closures", "Clôtures"],
      ["logs", "Logs"],
      ["settings", "Paramètres"],
      ["faq", "FAQ"],
    ],
    manager: [
      ["dashboard", "Dashboard"],
      ["stock", "Stock"],
      ["validations", "Backlog"],
      ["planning", "Planning"],
      ["closures", "Rapports"],
      ["faq", "FAQ"],
    ],
    agent: [
      ["sales", "Ventes"],
      ["stock", "Stock"],
      ["closures", "Clôturer"],
      ["faq", "FAQ"],
    ],
  };

  document.documentElement.dataset.theme = state.theme;
  boot();

  async function boot() {
    try {
      state.data = await api("/api/bootstrap");
      state.view = state.view || nav[state.data.me.role][0][0];
    } catch {
      state.data = null;
    }
    render();
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
      body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "request_failed");
    return payload;
  }

  function render() {
    document.documentElement.dataset.theme = state.theme;
    app.innerHTML = state.data ? renderShell() : renderLogin();
    annotateTables();
    bind();
  }

  function renderLogin() {
    return `
      <main class="login-shell product-login">
        <section class="login-panel">
          <div class="brand-row"><span class="mark">IR</span><span>Inventory Realm</span></div>
          <div>
            <h1 class="login-title">Pilotage d'inventaire multi-shop.</h1>
            <p class="login-copy">Une plateforme pour gérer catalogues, ventes, stock, équipes et clôtures avec séparation stricte par magasin.</p>
          </div>
          <form id="loginForm" class="form-stack auth-card">
            <div class="field"><label>Utilisateur</label><input id="username" name="username" autocomplete="username" required /></div>
            <div class="field"><label>Mot de passe</label><input id="password" name="password" type="password" minlength="8" autocomplete="current-password" required /></div>
            <button class="primary" type="submit">Se connecter</button>
          </form>
          <button class="ghost theme-login" data-action="toggleTheme">${state.theme === "dark" ? "Thème clair" : "Thème sombre"}</button>
        </section>
        <section class="login-visual">
          <div class="login-product">
            <h2>Une console. Plusieurs shops. Données isolées.</h2>
            <div class="product-points"><span>Stock validé</span><span>Ventes contrôlées</span><span>Planning équipe</span><span>Logs auditables</span></div>
          </div>
        </section>
      </main>
    `;
  }

  function renderShell() {
    const role = state.data.me.role;
    if (!nav[role].some(([key]) => key === state.view)) state.view = nav[role][0][0];
    const shop = state.data.shop;
    return `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="shop-identity">
            ${renderLogo(shop, role)}
            <div><h1>${escape(role === "super_user" ? "Plateforme" : shop.name)}</h1><p>${escape(role === "super_user" ? "Administration globale" : shop.address)}</p></div>
          </div>
          <nav class="nav">${nav[role].map(([key, label]) => `<button class="${state.view === key ? "active" : ""}" data-view="${key}">${label}</button>`).join("")}</nav>
          <div class="sidebar-footer">
            <button class="ghost" data-action="toggleTheme">${state.theme === "dark" ? "Thème clair" : "Thème sombre"}</button>
            <div class="role-chip"><b>${escape(state.data.me.name)}</b>${labels[role]}</div>
            <button class="ghost" data-action="logout">Déconnexion</button>
          </div>
        </aside>
        <main class="main">
          <header class="topbar">
            <div><h2>${escape(title())}</h2><p>${escape(subtitle())}</p></div>
            <div class="topbar-actions">
              <button class="ghost" data-action="toggleTheme">${state.theme === "dark" ? "Clair" : "Sombre"}</button>
              <button class="ghost" data-action="logout">Déconnexion</button>
            </div>
          </header>
          <nav class="mobile-nav">${mobileNav(role)}</nav>
          <div class="content">${renderView()}</div>
        </main>
      </div>
      ${state.message ? `<div class="toast"><div class="toast-item">${escape(state.message)}</div></div>` : ""}
    `;
  }

  function renderLogo(shop, role) {
    if (role === "super_user") return `<span class="shop-logo">SU</span>`;
    if (shop.logoData) return `<img class="shop-logo img-logo" src="${shop.logoData}" alt="" />`;
    return `<span class="shop-logo">${escape(shop.logoText || shop.name.slice(0, 2).toUpperCase())}</span>`;
  }

  function title() {
    return (nav[state.data.me.role].find(([key]) => key === state.view) || [null, "Dashboard"])[1];
  }

  function subtitle() {
    if (state.data.me.role === "super_user") return "Gestion plateforme";
    return `${state.data.shop.name} · ${labels[state.data.me.role]}`;
  }

  function mobileNav(role) {
    return nav[role]
      .map(([key, label]) => `<button class="${state.view === key ? "active" : ""}" data-view="${key}">${label}</button>`)
      .join("");
  }

  function renderView() {
    const role = state.data.me.role;
    if (role === "agent" && ["dashboard", "logs", "team", "planning", "promotions", "catalog", "validations"].includes(state.view)) state.view = "sales";
    const views = {
      super_shops: renderSuperShops,
      super_users: renderSuperUsers,
      super_settings: renderSuperSettings,
      super_logs: () => renderLogs(state.data.logs || []),
      dashboard: renderDashboard,
      sales: renderSales,
      stock: renderStock,
      catalog: renderCatalog,
      promotions: renderPromotions,
      validations: renderValidations,
      team: renderTeam,
      planning: renderPlanning,
      closures: renderClosures,
      logs: () => renderLogs(state.data.logs || []),
      settings: renderSettings,
      faq: renderFaq,
    };
    return (views[state.view] || views[nav[role][0][0]])();
  }

  function renderSuperShops() {
    return `
      <section class="section">
        <div class="section-head"><div><h3>Shops</h3><p>Création et configuration des magasins.</p></div></div>
        <div class="split">
          <form id="shopForm" class="panel panel-pad form-stack">
            <h3>Nouveau shop</h3>
            <div class="grid cols-2">
              <div class="field"><label>Nom</label><input name="name" required /></div>
              <div class="field"><label>Adresse</label><input name="address" required /></div>
              <div class="field"><label>Logo texte</label><input name="logoText" maxlength="3" /></div>
              <div class="field"><label>Logo image</label><input name="logoFile" type="file" accept="image/*" /></div>
              <div class="field"><label>Latitude GPS</label><input name="gpsLat" /></div>
              <div class="field"><label>Longitude GPS</label><input name="gpsLng" /></div>
              <div class="field"><label>Responsable</label><input name="adminName" required /></div>
              <div class="field"><label>Username responsable</label><input name="adminUsername" required /></div>
              <div class="field"><label>Mot de passe initial</label><input name="adminPassword" type="password" minlength="8" required /></div>
            </div>
            ${renderHoursFields()}
            <button class="primary" type="submit">Créer le shop</button>
          </form>
          <div class="panel panel-pad">
            <h3>Magasins actifs</h3>
            <div class="compact-list">${state.data.shops.map((shop) => `<div class="list-row"><div><strong>${escape(shop.name)}</strong><small>${escape(shop.address)}</small></div><span class="badge success">${escape(shop.status)}</span></div>`).join("")}</div>
          </div>
        </div>
      </section>
    `;
  }

  function renderSuperUsers() {
    return `<section class="section"><div class="section-head"><div><h3>Users plateforme</h3><p>Création des utilisateurs rattachés à un shop.</p></div></div>${renderUserForm(true)}${renderUsersTable(state.data.users)}</section>`;
  }

  function renderSuperSettings() {
    return `<section class="section"><div class="grid cols-2"><div class="panel panel-pad"><h3>Paramètres plateforme</h3><div class="compact-list"><div class="list-row"><strong>Nom</strong><span>${escape(state.data.settings.platformName)}</span></div><div class="list-row"><strong>Support</strong><span>${escape(state.data.settings.supportEmail)}</span></div></div></div><div class="panel panel-pad"><h3>Architecture</h3><p class="muted">Backend Node local, sessions serveur, mots de passe hashés, API par rôle.</p></div></div></section>`;
  }

  function renderDashboard() {
    const weekStart = startOfWeek(today);
    const previousWeekStart = addDays(weekStart, -7);
    const previousWeekEnd = addDays(weekStart, -1);
    const stats = periodStats(state.data.sales, weekStart, today);
    const previousStats = periodStats(state.data.sales, previousWeekStart, previousWeekEnd);
    const todayStats = periodStats(state.data.sales, today, today);
    const pendingSales = state.data.sales.filter((sale) => sale.status === "pending_admin_approval").length;
    const pendingStock = state.data.stockEntries.filter((entry) => entry.status === "pending_responsable_validation").length;
    const activeAlerts = state.data.alerts.filter((alert) => ["active", "acknowledged"].includes(alert.status));
    const completedSales = state.data.sales.filter((sale) => sale.status === "completed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const salesTarget = roleCanView("sales") ? "sales" : "closures";
    const salesLabel = roleCanView("sales") ? "Ventes" : "Rapports";
    const catalogTarget = roleCanView("catalog") ? "catalog" : "stock";
    const catalogLabel = roleCanView("catalog") ? "Catalogue" : "Stock";
    const averageBasket = stats.sales ? stats.revenue / stats.sales : 0;
    const margin = stats.revenue - stats.expected;
    const revenueEvolution = percentageChange(stats.revenue, previousStats.revenue);
    return `<section class="section dashboard-section">
      <div class="dashboard-kpis">
        ${kpi("CA semaine", money(stats.revenue), `${stats.sales} ventes · ${formatPercent(revenueEvolution)}`, "accent", { action: "dashboardNav", target: salesTarget, date: today })}
        ${kpi("Aujourd'hui", money(todayStats.revenue), `${todayStats.items} article${todayStats.items > 1 ? "s" : ""}`, "blue", { action: "dashboardNav", target: salesTarget, date: today })}
        ${kpi("Panier moyen", money(averageBasket), `${stats.items} articles vendus`, "accent", { action: "dashboardNav", target: salesTarget, date: today })}
        ${kpi("Marge semaine", signedMoney(margin), `${margin < 0 ? "perte" : "écart positif"}`, margin < 0 ? "danger" : "success", { action: "dashboardNav", target: salesTarget, date: today })}
      </div>
      <div class="dashboard-layout">
        <div class="panel panel-pad dashboard-panel chart-panel">
          <div class="panel-head"><div><h3>Courbe des ventes</h3><p>Chiffre d'affaires sur 7 jours.</p></div><button class="small-btn" data-action="dashboardNav" data-target="${salesTarget}" data-date="${today}">${salesLabel}</button></div>
          ${renderSalesTrend(salesTrend(7))}
        </div>
        <div class="panel panel-pad dashboard-panel">
          <div class="panel-head"><div><h3>Mix catégories</h3><p>Répartition du chiffre d'affaires.</p></div><button class="small-btn" data-action="dashboardNav" data-target="${catalogTarget}">${catalogLabel}</button></div>
          ${renderCategoryMix(categoryRevenueRows(state.data.sales))}
        </div>
      </div>
      <div class="dashboard-layout dashboard-secondary">
        <div class="panel panel-pad dashboard-panel">
          <div class="panel-head"><div><h3>Actions à traiter</h3><p>Éléments qui demandent une décision.</p></div><button class="small-btn" data-action="dashboardNav" data-target="validations">Backlog</button></div>
          ${renderPriorityList(pendingSales, pendingStock, activeAlerts)}
        </div>
        <div class="panel panel-pad dashboard-panel">
          <div class="panel-head"><div><h3>Top produits</h3><p>Types d'articles les plus vendus.</p></div><button class="small-btn" data-action="dashboardNav" data-target="${catalogTarget}">${catalogLabel}</button></div>
          ${renderTopTypes(topTypes(state.data.sales))}
        </div>
      </div>
      <div class="dashboard-layout dashboard-secondary">
        <div class="panel panel-pad dashboard-panel">
          <div class="panel-head"><div><h3>Ventes récentes</h3><p>Dernières transactions conclues.</p></div><button class="small-btn" data-action="dashboardNav" data-target="${salesTarget}" data-date="${today}">${salesLabel}</button></div>
          ${renderRecentSales(completedSales.slice(0, 5))}
        </div>
        <div class="panel panel-pad dashboard-panel">
          <div class="panel-head"><div><h3>Alertes stock</h3><p>Types sous seuil ou en rupture.</p></div><button class="small-btn" data-action="dashboardNav" data-target="stock">Stock</button></div>
          ${renderStockAlerts(activeAlerts)}
        </div>
      </div>
    </section>`;
  }

  function renderPriorityList(pendingSales, pendingStock, activeAlerts) {
    const rows = [];
    if (pendingSales) rows.push(["Ventes sous prix", pendingSales, "danger", "validations"]);
    if (pendingStock) rows.push(["Entrées stock", pendingStock, "warning", "validations"]);
    if (activeAlerts.length) rows.push(["Stocks critiques", activeAlerts.length, "warning", "stock"]);
    if (!rows.length) return `<div class="empty-state">Aucun point bloquant.</div>`;
    return `<div class="action-list">${rows.map(([label, value, tone, target]) => `<button class="action-row" data-action="dashboardNav" data-target="${target}"><strong>${escape(label)}</strong><span class="badge ${tone}">${value}</span></button>`).join("")}</div>`;
  }

  function renderSalesTrend(rows) {
    const width = 640;
    const height = 240;
    const left = 46;
    const right = 22;
    const top = 28;
    const bottom = 42;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const max = Math.max(...rows.map((row) => row.revenue), 1);
    const points = rows.map((row, index) => {
      const x = left + (index * chartWidth) / Math.max(rows.length - 1, 1);
      const y = top + chartHeight - (row.revenue / max) * chartHeight;
      return { ...row, x, y };
    });
    const path = points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const area = `${path} L ${points.at(-1)?.x || left} ${top + chartHeight} L ${left} ${top + chartHeight} Z`;
    const maxLabel = money(max);
    return `<div class="chart-wrap"><svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Courbe des ventes sur 7 jours">
      <defs><linearGradient id="salesArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".2"/><stop offset="100%" stop-color="currentColor" stop-opacity=".02"/></linearGradient></defs>
      <line class="chart-grid" x1="${left}" x2="${width - right}" y1="${top}" y2="${top}"></line>
      <line class="chart-grid" x1="${left}" x2="${width - right}" y1="${top + chartHeight / 2}" y2="${top + chartHeight / 2}"></line>
      <line class="chart-axis" x1="${left}" x2="${width - right}" y1="${top + chartHeight}" y2="${top + chartHeight}"></line>
      <text class="chart-y-label" x="4" y="${top + 5}">${escape(maxLabel)}</text>
      <path class="chart-area" d="${area}"></path>
      <path class="chart-line" d="${path}"></path>
      ${points.map((point) => `<g class="chart-point"><circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5"></circle><text x="${point.x.toFixed(1)}" y="${height - 13}" text-anchor="middle">${escape(point.label)}</text><title>${escape(point.date)} · ${money(point.revenue)} · ${point.sales} vente${point.sales > 1 ? "s" : ""}</title></g>`).join("")}
    </svg></div>`;
  }

  function renderCategoryMix(rows) {
    if (!rows.length) return `<div class="empty-state">Aucune vente conclue.</div>`;
    const max = Math.max(...rows.map((row) => row.revenue), 1);
    return `<div class="bar-list dashboard-bars">${rows.map((row) => `<button class="dashboard-bar" data-action="dashboardCategory" data-category-id="${row.categoryId}"><header><span>${escape(row.name)}</span><strong>${money(row.revenue)}</strong></header><div class="bar-track"><div class="bar-fill" style="width:${Math.max(6, (row.revenue / max) * 100)}%"></div></div><small>${row.quantity} article${row.quantity > 1 ? "s" : ""}</small></button>`).join("")}</div>`;
  }

  function renderTopTypes(rows) {
    if (!rows.length) return `<div class="empty-state">Aucune donnée.</div>`;
    const max = Math.max(...rows.map((row) => row.qty), 1);
    return `<div class="bar-list dashboard-bars">${rows.map((row) => `<button class="dashboard-bar" data-action="dashboardType" data-type-id="${row.id}"><header><span>${escape(row.name)}</span><strong>${row.qty}</strong></header><div class="bar-track"><div class="bar-fill" style="width:${Math.max(6, (row.qty / max) * 100)}%"></div></div><small>${money(row.revenue)}</small></button>`).join("")}</div>`;
  }

  function renderRecentSales(sales) {
    if (!sales.length) return `<div class="empty-state">Aucune vente conclue.</div>`;
    return `<div class="action-list">${sales.map((sale) => { const totals = totalsForSale(sale); return `<button class="action-row sale-action-row" data-action="dashboardSale" data-sale-id="${sale.id}"><div><strong>${money(totals.sold)}</strong><small>${formatDate(sale.createdAt)} · ${totals.quantity} article${totals.quantity > 1 ? "s" : ""}</small></div>${badge(sale.status)}</button>`; }).join("")}</div>`;
  }

  function renderStockAlerts(alerts) {
    if (!alerts.length) return `<div class="empty-state">Aucune alerte active.</div>`;
    return `<div class="action-list">${alerts.slice(0, 6).map((alert) => { const type = typeById(alert.typeId); const status = state.data.stockStatuses?.[alert.typeId]; const available = Number(status?.available ?? stockTotalForType(alert.typeId)); const tone = available <= 0 ? "danger" : "warning"; return `<button class="action-row" data-action="dashboardAlert" data-type-id="${alert.typeId}"><div><strong>${escape(type?.name || alert.typeId)}</strong><small>${available} article${available > 1 ? "s" : ""} restant${available > 1 ? "s" : ""}</small></div><span class="badge ${tone}">${available <= 0 ? "Rupture" : "Stock bas"}</span></button>`; }).join("")}</div>`;
  }

  function renderSales() {
    const sales = state.data.sales.filter((sale) => sale.createdAt.slice(0, 10) === state.saleDate);
    return `<section class="section"><div class="section-head"><div><h3>Ventes</h3><p>Panier multi-articles et validation finale.</p></div><div class="field compact-field"><label>Date</label><input id="saleDate" type="date" value="${state.saleDate}" max="${today}" /></div></div><div class="sales-shell"><div class="sale-builder-grid">${renderSaleComposer()}</div><div class="panel panel-pad sale-detail-panel">${renderSaleDetail()}</div></div>${renderSalesTable(sales)}</section>`;
  }

  function renderSaleComposer() {
    const totals = cartTotals();
    const results = productResults();
    return `<div class="panel panel-pad sale-catalog-panel">
      <div class="sale-panel-head"><div><h3>Catalogue</h3><p>Sélectionner les articles à vendre.</p></div><span class="badge blue">${results.length} articles</span></div>
      <div class="field"><label>Recherche article</label><input id="productSearch" value="${escape(state.productQuery)}" placeholder="Nom, type, SKU, catégorie" /></div>
      <div class="product-results">${renderProductResults(results)}</div>
    </div>
    <form id="saleForm" class="panel panel-pad sale-cart-panel">
      <div class="sale-panel-head"><div><h3>Panier</h3><p>Articles de la vente en cours.</p></div><span class="cart-pill">${totals.items} unité${totals.items > 1 ? "s" : ""}</span></div>
      ${renderCart()}
      ${renderCartSummary(totals)}
      <div class="grid cols-2"><div class="field"><label>Client</label><input name="clientName" placeholder="Facultatif" /></div><div class="field"><label>Contact</label><input name="contact" placeholder="Facultatif" /></div></div>
      <button class="primary cart-submit" type="submit" ${state.cart.length ? "" : "disabled"}>Valider la vente</button>
    </form>`;
  }

  function renderProductResults(results = productResults()) {
    return results.slice(0, 8).map((variant) => {
      const price = priceFor(variant);
      const type = typeById(variant.typeId);
      return `<button class="product-result" data-action="addCart" data-id="${variant.id}"><span><strong>${escape(variant.name)}</strong><small>${escape(type?.name || "")} · ${variant.sku} · stock ${variant.stock}</small></span><b>${money(price.applicablePrice)}</b></button>`;
    }).join("") || `<div class="empty-state">Aucun article trouvé.</div>`;
  }

  function renderCart() {
    if (!state.cart.length) return `<div class="cart-empty">Aucun article dans le panier.</div>`;
    return `<div class="cart-list">${state.cart.map((item, index) => { const variant = variantById(item.variantId); const price = priceFor(variant); const delta = cartItemDelta(item, variant); return `<div class="cart-row" data-index="${index}"><div class="cart-item-main"><strong>${escape(variant.name)}</strong><small>Prix appliqué ${money(price.applicablePrice)}</small></div><label><span>Qté</span><input data-cart="${index}" data-field="quantity" type="number" min="1" max="${variant.stock}" value="${item.quantity}" /></label><label><span>Prix</span><input data-cart="${index}" data-field="soldPrice" type="number" min="0" step="0.01" value="${item.soldPrice}" /></label>${renderDelta(delta)}<button class="small-btn" type="button" data-action="removeCart" data-index="${index}">Retirer</button></div>`; }).join("")}</div>`;
  }

  function renderCartSummary(totals) {
    const delta = roundMoney(totals.delta);
    return `<div class="cart-summary ${delta === 0 ? "single" : ""}"><div><span>Total panier</span><strong>${money(totals.sold)}</strong></div>${delta === 0 ? "" : `<div><span>Écart</span><strong class="${delta < 0 ? "loss" : "gain"}">${signedMoney(delta)}</strong></div>`}</div>`;
  }

  function renderDelta(delta) {
    const rounded = roundMoney(delta);
    if (rounded === 0) return `<span class="delta is-empty" aria-hidden="true"></span>`;
    return `<span class="delta ${rounded < 0 ? "loss" : "gain"}">${signedMoney(rounded)}</span>`;
  }

  function cartItemDelta(item, variant = variantById(item.variantId)) {
    if (!variant) return 0;
    const price = priceFor(variant);
    return (Number(item.soldPrice || 0) - price.applicablePrice) * Number(item.quantity || 0);
  }

  function renderSaleDetail() {
    const sale = state.data.sales.find((item) => item.id === state.selectedSaleId) || state.data.sales[0];
    if (!sale) return `<h3>Détail vente</h3><div class="empty-state">Sélectionner une vente.</div>`;
    const totals = totalsForSale(sale);
    return `<h3>Détail vente</h3><div class="compact-list"><div class="list-row"><strong>Statut</strong>${badge(sale.status)}</div><div class="list-row"><strong>Date</strong><span>${formatDate(sale.createdAt)}</span></div><div class="list-row"><strong>Total vendu</strong><span class="money">${money(totals.sold)}</span></div></div><div class="sale-lines">${sale.lines.map((line) => { const variant = variantById(line.variantId); return `<div class="list-row"><div><strong>${escape(variant?.name || line.variantId)}</strong><small>${line.quantity} x ${money(line.soldPrice)}</small></div><span>${signedMoney((line.soldPrice - line.applicablePrice) * line.quantity)}</span></div>`; }).join("")}</div>`;
  }

  function renderSalesTable(sales) {
    if (!sales.length) return `<div class="empty-state">Aucune vente pour cette date.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Vente</th><th>Articles</th><th>Total</th><th>Écart</th><th>Statut</th><th>Action</th></tr></thead><tbody>${sales.map((sale) => { const totals = totalsForSale(sale); return `<tr><td><strong>${sale.id}</strong><br><span class="muted">${formatDate(sale.createdAt)}</span></td><td>${sale.lines.map((line) => `${line.quantity} x ${escape(variantById(line.variantId)?.name || "")}`).join("<br>")}</td><td>${money(totals.sold)}</td><td>${signedMoney(totals.sold - totals.expected)}</td><td>${badge(sale.status)}</td><td><div class="actions"><button class="small-btn" data-action="viewSale" data-id="${sale.id}">Détails</button>${sale.status === "pending_admin_approval" && state.data.me.role === "shop_admin" ? `<button class="small-btn primary" data-action="saleDecision" data-id="${sale.id}" data-decision="approved">Approuver</button><button class="small-btn danger-btn" data-action="saleDecision" data-id="${sale.id}" data-decision="rejected">Rejeter</button>` : ""}</div></td></tr>`; }).join("")}</tbody></table></div>`;
  }

  function renderStock() {
    const canDeclare = ["shop_admin", "manager"].includes(state.data.me.role);
    return `<section class="section"><div class="section-head"><div><h3>Stock</h3><p>Vue hiérarchique par catégorie, sous-catégorie, type et variante.</p></div></div><div class="panel panel-pad stock-browser"><div class="field"><label>Recherche stock</label><input id="stockTreeSearch" value="${escape(state.stockQuery)}" placeholder="Nom, type, SKU, catégorie" /></div><div class="stock-tree">${renderStockTree()}</div></div>${canDeclare ? `<div class="panel panel-pad">${renderStockForm()}</div>` : ""}</section>`;
  }

  function renderStockForm() {
    return `<form id="stockForm" class="grid cols-3"><div class="field"><label>Variante</label><select name="variantId">${state.data.variants.map((variant) => `<option value="${variant.id}">${escape(variant.name)} · ${variant.sku}</option>`).join("")}</select></div><div class="field"><label>Quantité</label><input name="quantity" type="number" min="1" value="1" /></div><div class="field"><label>Commentaire</label><input name="comment" /></div><button class="primary" type="submit">Déclarer l'entrée</button></form>`;
  }

  function renderStockTree() {
    const q = normalizeSearch(state.stockQuery);
    const html = state.data.categories.map((cat) => renderStockCategory(cat, q)).filter(Boolean).join("");
    return html || `<div class="empty-state">Aucun article trouvé.</div>`;
  }

  function renderStockCategory(cat, q) {
    const catMatches = q && normalizeSearch(cat.name).includes(q);
    const subs = state.data.subcategories.filter((sub) => sub.categoryId === cat.id);
    const subHtml = subs.map((sub) => renderStockSubcategory(cat, sub, q, catMatches)).filter(Boolean).join("");
    if (q && !catMatches && !subHtml) return "";
    const open = q || state.expanded.has(cat.id);
    const total = subs.reduce((sum, sub) => sum + stockTotalForSubcategory(sub.id), 0);
    return `<div class="stock-node"><button class="tree-toggle stock-toggle" data-action="toggleTree" data-id="${cat.id}"><span>${open ? "−" : "+"} ${escape(cat.name)}</span><strong>${total} articles</strong></button>${open ? `<div class="tree-branch">${subHtml}</div>` : ""}</div>`;
  }

  function renderStockSubcategory(cat, sub, q, parentMatches) {
    const subMatches = parentMatches || (q && normalizeSearch(`${cat.name} ${sub.name}`).includes(q));
    const types = state.data.types.filter((type) => type.subcategoryId === sub.id);
    const typeHtml = types.map((type) => renderStockType(cat, sub, type, q, subMatches)).filter(Boolean).join("");
    if (q && !subMatches && !typeHtml) return "";
    const open = q || state.expanded.has(sub.id);
    return `<div class="stock-node"><button class="tree-toggle stock-toggle" data-action="toggleTree" data-id="${sub.id}"><span>${open ? "−" : "+"} ${escape(sub.name)}</span><strong>${stockTotalForSubcategory(sub.id)} articles</strong></button>${open ? `<div class="tree-branch">${typeHtml}</div>` : ""}</div>`;
  }

  function renderStockType(cat, sub, type, q, parentMatches) {
    const variants = state.data.variants.filter((variant) => variant.typeId === type.id);
    const typeMatches = parentMatches || (q && normalizeSearch(`${cat.name} ${sub.name} ${type.name}`).includes(q));
    const visibleVariants = (!q || typeMatches) ? variants : variants.filter((variant) => normalizeSearch(`${cat.name} ${sub.name} ${type.name} ${variant.name} ${variant.sku}`).includes(q));
    if (q && !typeMatches && !visibleVariants.length) return "";
    const id = `stock-type-${type.id}`;
    const open = q || state.expanded.has(id);
    const total = stockTotalForType(type.id);
    return `<div class="stock-node"><button class="tree-toggle stock-toggle stock-type-toggle" data-action="toggleTree" data-id="${id}"><span>${open ? "−" : "+"} ${escape(type.name)}</span><strong>${total} articles</strong></button>${open ? `<div class="stock-variants">${visibleVariants.map((variant) => `<div class="tree-leaf stock-variant"><div><strong>${escape(variant.name)}</strong><small>${escape(variant.sku)}</small></div><span class="stock-count">${variant.stock}</span></div>`).join("")}</div>` : ""}</div>`;
  }

  function stockTotalForType(typeId) {
    return state.data.variants.filter((variant) => variant.typeId === typeId).reduce((sum, variant) => sum + Number(variant.stock), 0);
  }

  function stockTotalForSubcategory(subcategoryId) {
    return state.data.types.filter((type) => type.subcategoryId === subcategoryId).reduce((sum, type) => sum + stockTotalForType(type.id), 0);
  }

  function renderCatalog() {
    const cats = state.data.categories;
    const subs = state.data.subcategories.filter((sub) => !state.catalogCategory || sub.categoryId === state.catalogCategory);
    const selectedFilterSub = state.catalogSubcategory || "";
    const selectedTargetSub = state.catalogSubcategory || subs[0]?.id || "";
    const filterOptions = `<option value="" ${!selectedFilterSub ? "selected" : ""}>Toutes</option>${subs.map((sub) => `<option value="${sub.id}" ${selectedFilterSub === sub.id ? "selected" : ""}>${escape(sub.name)}</option>`).join("")}`;
    const targetOptions = subs.map((sub) => `<option value="${sub.id}" ${selectedTargetSub === sub.id ? "selected" : ""}>${escape(sub.name)}</option>`).join("");
    return `<section class="section"><div class="section-head"><div><h3>Catalogue</h3><p>Parcourir et filtrer par catégorie, sous-catégorie, type et variante.</p></div></div><div class="grid cols-2"><div class="panel panel-pad"><div class="grid cols-2"><div class="field"><label>Catégorie</label><select id="catFilter"><option value="">Toutes</option>${cats.map((cat) => `<option value="${cat.id}" ${state.catalogCategory === cat.id ? "selected" : ""}>${escape(cat.name)}</option>`).join("")}</select></div><div class="field"><label>Sous-catégorie</label><select id="subFilter">${filterOptions}</select></div></div>${renderCatalogTree()}</div><div class="panel panel-pad"><h3>Ajouter</h3><form id="typeForm" class="form-stack"><div class="field"><label>Sous-catégorie cible</label><select name="subcategoryId">${targetOptions}</select></div><div class="grid cols-2"><div class="field"><label>Nouveau type d'article</label><input name="name" required /></div><div class="field"><label>Quantité référence</label><input name="referenceQty" type="number" min="1" value="10" /></div></div><button class="primary">Créer type</button></form><form id="variantForm" class="form-stack separated"><div class="field"><label>Type existant</label><select name="typeId">${state.data.types.map((type) => `<option value="${type.id}">${escape(type.name)}</option>`).join("")}</select></div><div class="grid cols-2"><div class="field"><label>Variante</label><input name="name" required /></div><div class="field"><label>Prix référence</label><input name="referencePrice" type="number" min="0" step="0.01" /></div></div><button class="secondary">Créer variante</button></form></div></div></section>`;
  }

  function renderCatalogTree() {
    const categories = state.data.categories.filter((cat) => !state.catalogCategory || state.catalogCategory === cat.id);
    return `<div class="catalog-status-legend"><span class="status-key status-available">Disponible</span><span class="status-key status-low">Stock bas</span><span class="status-key status-out">Rupture</span></div><div class="catalog-tree">${categories.map(renderCatalogCategory).join("")}</div>`;
  }

  function renderCatalogCategory(cat) {
    const catOpen = state.catalogCategory === cat.id || state.expanded.has(cat.id);
    const subs = state.data.subcategories.filter((sub) => sub.categoryId === cat.id && (!state.catalogSubcategory || state.catalogSubcategory === sub.id));
    return `<div class="tree-item"><button data-action="toggleTree" data-id="${cat.id}" class="tree-toggle">${catOpen ? "−" : "+"} ${escape(cat.name)}</button>${catOpen ? subs.map((sub) => renderCatalogSubcategory(sub)).join("") : ""}</div>`;
  }

  function renderCatalogSubcategory(sub) {
    const subOpen = state.catalogSubcategory === sub.id || state.expanded.has(sub.id);
    const types = state.data.types.filter((type) => type.subcategoryId === sub.id);
    return `<div class="tree-branch"><button data-action="toggleTree" data-id="${sub.id}" class="tree-toggle">${subOpen ? "−" : "+"} ${escape(sub.name)}</button>${subOpen ? types.map(renderCatalogType).join("") : ""}</div>`;
  }

  function renderCatalogType(type) {
    const status = catalogStatusForType(type);
    const variants = state.data.variants.filter((variant) => variant.typeId === type.id);
    return `<div class="catalog-type catalog-status-${status.key}"><div class="catalog-type-head"><div><strong>${escape(type.name)}</strong><small>${status.available} article${status.available > 1 ? "s" : ""}</small></div>${renderStockStatusPill(status)}</div><div class="catalog-variants">${variants.length ? variants.map((variant) => renderCatalogVariant(variant, status)).join("") : `<div class="empty-state">Aucune variante.</div>`}</div></div>`;
  }

  function renderCatalogVariant(variant, typeStatus) {
    const status = catalogStatusForVariant(variant, typeStatus);
    return `<div class="catalog-variant catalog-status-${status.key}"><div><strong>${escape(variant.name)}</strong><small>${escape(variant.sku)} · ${money(variant.referencePrice)}</small></div><span class="stock-chip">${Number(variant.stock || 0)}</span></div>`;
  }

  function renderStockStatusPill(status) {
    return `<span class="status-pill status-${status.key}">${status.label}</span>`;
  }

  function catalogStatusForType(type) {
    const backend = state.data.stockStatuses?.[type.id];
    const available = Number(backend?.available ?? stockTotalForType(type.id));
    const key = backend?.status || stockStatusKey(available, Number(backend?.threshold ?? stockThreshold(type)));
    return { key, label: stockStatusLabel(key), available };
  }

  function catalogStatusForVariant(variant, typeStatus) {
    const stock = Number(variant.stock || 0);
    const key = stock <= 0 ? "out" : typeStatus.key === "low" ? "low" : "available";
    return { key, label: stockStatusLabel(key), available: stock };
  }

  function stockThreshold(type) {
    return Math.max(1, Math.ceil(Number(type.referenceQty || 0) * 0.15));
  }

  function stockStatusKey(available, min) {
    if (available <= 0) return "out";
    return available <= min ? "low" : "available";
  }

  function stockStatusLabel(key) {
    return { available: "Disponible", low: "Stock bas", out: "Rupture" }[key] || "Stock";
  }

  function renderPromotions() {
    return `<section class="section"><div class="section-head"><div><h3>Promotions</h3><p>Une seule promotion applicable : la cible la plus spécifique gagne.</p></div></div><form id="promoForm" class="panel panel-pad grid cols-3"><div class="field"><label>Libellé</label><input name="label" required /></div><div class="field"><label>Cible</label><select name="target">${promoTargets()}</select></div><div class="field"><label>Réduction %</label><input name="discountPercent" type="number" min="1" max="90" value="10" /></div><div class="field"><label>Début</label><input name="startDate" type="date" value="${today}" /></div><div class="field"><label>Fin</label><input name="endDate" type="date" value="${today}" /></div><button class="primary">Créer</button></form><div class="table-wrap"><table><thead><tr><th>Promo</th><th>Cible</th><th>Réduction</th><th>Validité</th></tr></thead><tbody>${state.data.promotions.map((promo) => `<tr><td>${escape(promo.label)}</td><td>${escape(promo.targetScope)} · ${escape(targetName(promo.targetScope, promo.targetId))}</td><td>${promo.discountPercent}%</td><td>${promo.startDate} → ${promo.endDate}</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderValidations() {
    const stock = state.data.stockEntries.filter((entry) => entry.status === "pending_responsable_validation");
    const sales = state.data.sales.filter((sale) => sale.status === "pending_admin_approval");
    const canDecide = state.data.me.role === "shop_admin";
    return `<section class="section"><div class="section-head"><div><h3>${canDecide ? "Validations" : "Backlog"}</h3><p>${canDecide ? "Décisions du responsable shop." : "Consultation des éléments en attente."}</p></div></div><div class="grid cols-2"><div class="panel panel-pad"><h3>Entrées stock</h3>${stock.length ? stock.map((entry) => validationEntry(entry, canDecide)).join("") : `<div class="empty-state">Aucune entrée en attente.</div>`}</div><div class="panel panel-pad"><h3>Ventes sous prix</h3>${sales.length ? renderSalesTable(sales) : `<div class="empty-state">Aucune vente en attente.</div>`}</div></div>${renderEntryDetail()}</section>`;
  }

  function validationEntry(entry, canDecide) {
    const variant = variantById(entry.variantId);
    return `<div class="list-row"><div><strong>${escape(variant?.name || entry.variantId)}</strong><small>+${entry.quantity} · ${formatDate(entry.declaredAt)}</small></div><div class="actions"><button class="small-btn" data-action="viewEntry" data-id="${entry.id}">Détails</button>${canDecide ? `<button class="small-btn primary" data-action="stockDecision" data-id="${entry.id}" data-decision="validated">Valider</button><button class="small-btn danger-btn" data-action="stockDecision" data-id="${entry.id}" data-decision="rejected">Rejeter</button>` : ""}</div></div>`;
  }

  function renderEntryDetail() {
    const entry = state.data.stockEntries.find((item) => item.id === state.selectedEntryId);
    if (!entry) return "";
    const variant = variantById(entry.variantId);
    const type = variant ? typeById(variant.typeId) : null;
    return `<div class="panel panel-pad"><h3>Détail entrée stock</h3><div class="grid cols-3"><div class="list-row"><strong>Article</strong><span>${escape(variant?.name || "")}</span></div><div class="list-row"><strong>Type</strong><span>${escape(type?.name || "")}</span></div><div class="list-row"><strong>Quantité</strong><span>${entry.quantity}</span></div><div class="list-row"><strong>Statut</strong>${badge(entry.status)}</div><div class="list-row"><strong>Déclaré</strong><span>${formatDate(entry.declaredAt)}</span></div><div class="list-row"><strong>Commentaire</strong><span>${escape(entry.comment || "")}</span></div></div></div>`;
  }

  function renderTeam() {
    return `<section class="section"><div class="section-head"><div><h3>Équipe</h3><p>Création et gestion des utilisateurs du shop.</p></div></div>${renderUserForm(false)}${renderUsersTable(state.data.users)}</section>`;
  }

  function renderUserForm(isSuper) {
    return `<form id="userForm" class="panel panel-pad grid cols-3">${isSuper ? `<div class="field"><label>Shop</label><select name="shopId">${state.data.shops.map((shop) => `<option value="${shop.id}">${escape(shop.name)}</option>`).join("")}</select></div>` : ""}<div class="field"><label>Nom</label><input name="name" required /></div><div class="field"><label>Username</label><input name="username" required /></div><div class="field"><label>Rôle</label><select name="role"><option value="agent">Agent</option><option value="manager">Manager</option><option value="shop_admin">Responsable shop</option></select></div><div class="field"><label>Mot de passe</label><input name="password" type="password" minlength="8" required /></div><button class="primary">Créer user</button></form>`;
  }

  function renderUsersTable(users) {
    return `<div class="table-wrap"><table><thead><tr><th>Nom</th><th>Username</th><th>Rôle</th><th>Shop</th></tr></thead><tbody>${users.map((user) => `<tr><td>${escape(user.name)}</td><td>${escape(user.username)}</td><td>${labels[user.role]}</td><td>${escape(shopById(user.shopId)?.name || "Plateforme")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderPlanning() {
    const week = weekDays(state.planningDate);
    const users = state.data.users.filter((user) => user.role !== "shop_admin");
    const slots = state.data.shiftSlots || [];
    const canConfigure = state.data.me.role === "shop_admin";
    return `<section class="section"><div class="section-head"><div><h3>Planning</h3><p>Créer les plages, puis glisser les utilisateurs dans l'agenda.</p></div><div class="actions"><input id="planningDate" type="date" value="${state.planningDate}" /><button class="secondary" data-action="planningMode">${state.planningMode === "week" ? "Vue jour" : "Vue semaine"}</button></div></div><div class="planning-layout"><div class="planning-side"><div class="panel panel-pad"><h3>Équipe</h3><div class="drag-users">${users.map((user) => renderDragUser(user, canConfigure)).join("")}</div></div><div class="panel panel-pad"><h3>Plages horaires</h3>${canConfigure ? renderShiftSlotForm() : ""}${renderShiftSlotList(slots)}</div></div><div class="panel panel-pad planning-grid">${renderPlanningGrid(week)}</div></div></section>`;
  }

  function renderDragUser(user, draggable) {
    return `<div class="drag-user" draggable="${draggable}" data-user="${user.id}" style="${userChipStyle(user)}"><span class="user-dot">${userInitials(user.name)}</span><div><strong>${escape(user.name)}</strong><small>${labels[user.role]}</small></div></div>`;
  }

  function renderShiftSlotForm() {
    return `<form id="shiftSlotForm" class="shift-slot-form"><div class="field"><label>Nom de la plage</label><input name="name" placeholder="Ex: Ouverture, Caisse 1" required /></div><div class="grid cols-2"><div class="field"><label>Début</label><input name="start" type="time" required /></div><div class="field"><label>Fin</label><input name="end" type="time" required /></div></div><button class="secondary" type="submit">Créer la plage</button></form>`;
  }

  function renderShiftSlotList(slots) {
    if (!slots.length) return `<div class="empty-state">Aucune plage créée.</div>`;
    return `<div class="shift-slot-list">${slots.map((slot) => `<div class="shift-slot-row"><strong>${escape(slot.name)}</strong><span>${escape(slot.start)} → ${escape(slot.end)}</span></div>`).join("")}</div>`;
  }

  function renderPlanningGrid(days) {
    const visibleDays = state.planningMode === "day" ? days.filter((day) => day === state.planningDate) : days;
    const slots = state.data.shiftSlots || [];
    if (!slots.length) return `<div class="empty-state">Créer au moins une plage horaire avant de planifier.</div>`;
    return `<div class="schedule">${visibleDays.map((day) => `<div class="schedule-day"><h4>${day}</h4>${slots.map((slot) => { const shifts = state.data.planning.filter((item) => item.date === day && (item.slotId === slot.id || item.slot === slot.name)); return `<div class="drop-slot" data-date="${day}" data-slot-id="${slot.id}"><header><strong>${escape(slot.name)}</strong><small>${escape(slot.start)}-${escape(slot.end)}</small></header><div class="scheduled-users">${shifts.map(renderPlannedShift).join("") || `<small>Disponible</small>`}</div></div>`; }).join("")}</div>`).join("")}</div>`;
  }

  function renderPlannedShift(shift) {
    const user = userById(shift.userId);
    if (!user) return "";
    return `<span class="planned-user" style="${userChipStyle(user)}"><b>${userInitials(user.name)}</b>${escape(user.name)}</span>`;
  }

  function renderClosures() {
    const selectedSales = state.data.sales.filter((sale) => sale.createdAt.slice(0, 10) === state.closureDate && sale.status === "completed");
    const summary = periodStats(selectedSales, state.closureDate, state.closureDate);
    const canClose = ["agent", "shop_admin"].includes(state.data.me.role);
    return `<section class="section"><div class="section-head"><div><h3>${state.data.me.role === "agent" ? "Clôturer" : "Clôtures et rapports"}</h3><p>Résumé des ventes par date.</p></div></div><div class="split"><form id="closureForm" class="panel panel-pad form-stack"><div class="actions"><button type="button" class="secondary" data-action="closureToday">Aujourd'hui</button></div><div class="field"><label>Date</label><input name="date" type="date" max="${today}" value="${state.closureDate}" /></div><div class="grid cols-3">${kpi("Ventes", summary.sales, "conclues", "accent")}${kpi("Articles", summary.items, "unités", "blue")}${kpi("Total", money(summary.revenue), "encaissé", "accent")}</div><div class="field"><label>Commentaire</label><textarea name="comment"></textarea></div>${canClose ? `<button class="primary">Clôturer la date</button>` : ""}</form><div class="panel panel-pad"><h3>Historique</h3>${state.data.closures.length ? state.data.closures.map((closure) => `<div class="list-row"><div><strong>${closure.businessDate}</strong><small>${escape(closure.comment || "")}</small></div><span>${money(closure.summary.revenue)}</span></div>`).join("") : `<div class="empty-state">Aucune clôture.</div>`}</div></div>${renderSalesTable(selectedSales)}</section>`;
  }

  function renderLogs(logs) {
    return `<section class="section"><div class="section-head"><div><h3>Logs</h3><p>Événements machine, rendu humain à l'écran.</p></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Code</th><th>Acteur</th><th>Objet</th><th>Statut</th></tr></thead><tbody>${logs.map((log) => `<tr><td>${formatDate(log.createdAt)}</td><td><span class="log-code">${escape(log.eventCode)}</span></td><td>${escape(userById(log.actorId)?.name || log.role)}</td><td>${escape(log.entityType)} · ${escape(log.entityId)}</td><td>${badge(log.status)}</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderSettings() {
    const shop = state.data.shop;
    return `<section class="section"><div class="section-head"><div><h3>Paramètres shop</h3><p>Identité, horaires et localisation.</p></div></div><div class="split"><form id="settingsForm" class="panel panel-pad form-stack"><div class="grid cols-2"><div class="field"><label>Nom</label><input name="name" value="${escape(shop.name)}" /></div><div class="field"><label>Adresse</label><input name="address" value="${escape(shop.address)}" /></div><div class="field"><label>Logo texte</label><input name="logoText" maxlength="3" value="${escape(shop.logoText || "")}" /></div><div class="field"><label>Logo image</label><input name="logoFile" type="file" accept="image/*" /></div><div class="field"><label>Latitude GPS</label><input name="gpsLat" value="${escape(shop.gpsLat || "")}" /></div><div class="field"><label>Longitude GPS</label><input name="gpsLng" value="${escape(shop.gpsLng || "")}" /></div></div>${renderHoursFields(shop.hours)}<button class="primary">Enregistrer</button></form><div class="panel panel-pad"><h3>Carte</h3>${shop.gpsLat && shop.gpsLng ? `<iframe class="map" src="https://maps.google.com/maps?q=${encodeURIComponent(shop.gpsLat)},${encodeURIComponent(shop.gpsLng)}&z=15&output=embed"></iframe><a class="secondary map-link" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop.gpsLat + "," + shop.gpsLng)}">Ouvrir Google Maps</a>` : `<div class="empty-state">Coordonnées GPS non renseignées.</div>`}</div></div></section>`;
  }

  function renderFaq() {
    const role = state.data.me.role;
    const items = {
      super_user: [["Créer un shop", "Renseigner identité, horaires, GPS et responsable."], ["Users", "Créer uniquement des utilisateurs rattachés à un shop."]],
      shop_admin: [["Validations", "Les ventes sous prix et les entrées stock sont décidées ici."], ["Équipe", "Créer users et planifier les plages de travail."]],
      manager: [["Backlog", "Consulter les entrées et ventes en attente. La décision revient au responsable."], ["Rapports", "Consulter les ventes et clôtures."]],
      agent: [["Ventes", "Composer un panier, ajuster les prix si nécessaire, puis valider."], ["Clôture", "Clôturer aujourd'hui ou une date passée non clôturée."]],
    }[role];
    return `<section class="section"><div class="section-head"><div><h3>FAQ ${labels[role]}</h3><p>Aide ciblée par profil.</p></div></div><div class="grid cols-2">${items.map(([q, a]) => `<div class="panel panel-pad"><h3>${q}</h3><p class="muted">${a}</p></div>`).join("")}</div></section>`;
  }

  function renderHoursFields(hours = defaultHours()) {
    const days = [["monday", "Lun"], ["tuesday", "Mar"], ["wednesday", "Mer"], ["thursday", "Jeu"], ["friday", "Ven"], ["saturday", "Sam"], ["sunday", "Dim"]];
    return `<div class="hours-grid">${days.map(([key, label]) => { const value = hours[key] || { open: "08:00", close: "18:00", closed: false }; return `<div class="hours-row"><strong>${label}</strong><input name="${key}_open" type="time" value="${value.open}" /><input name="${key}_close" type="time" value="${value.close}" /><label><input name="${key}_closed" type="checkbox" ${value.closed ? "checked" : ""}/> Fermé</label></div>`; }).join("")}</div>`;
  }

  function defaultHours() {
    return { monday: { open: "08:00", close: "18:00", closed: false }, tuesday: { open: "08:00", close: "18:00", closed: false }, wednesday: { open: "08:00", close: "18:00", closed: false }, thursday: { open: "08:00", close: "18:00", closed: false }, friday: { open: "08:00", close: "18:00", closed: false }, saturday: { open: "09:00", close: "16:00", closed: false }, sunday: { open: "00:00", close: "00:00", closed: true } };
  }

  function bind() {
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));
    document.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", () => action(el)));
    document.getElementById("loginForm")?.addEventListener("submit", login);
    document.getElementById("saleDate")?.addEventListener("change", (event) => { state.saleDate = event.target.value; render(); });
    document.getElementById("productSearch")?.addEventListener("input", (event) => { state.productQuery = event.target.value; refreshProductResults(); });
    document.getElementById("stockTreeSearch")?.addEventListener("input", (event) => { state.stockQuery = event.target.value; refreshStockTree(); });
    document.getElementById("catFilter")?.addEventListener("change", (event) => { state.catalogCategory = event.target.value; state.catalogSubcategory = ""; render(); });
    document.getElementById("subFilter")?.addEventListener("change", (event) => { state.catalogSubcategory = event.target.value; render(); });
    document.getElementById("planningDate")?.addEventListener("change", (event) => { state.planningDate = event.target.value; render(); });
    bindForm("saleForm", submitSale);
    bindForm("stockForm", submitStock);
    bindForm("typeForm", submitType);
    bindForm("variantForm", submitVariant);
    bindForm("promoForm", submitPromo);
    bindForm("userForm", submitUser);
    bindForm("shiftSlotForm", submitShiftSlot);
    bindForm("shopForm", submitShop);
    bindForm("settingsForm", submitSettings);
    bindForm("closureForm", submitClosure);
    document.querySelectorAll("[data-cart]").forEach((input) => input.addEventListener("input", updateCart));
    bindDragDrop();
  }

  function bindForm(id, handler) {
    document.getElementById(id)?.addEventListener("submit", (event) => {
      event.preventDefault();
      handler(new FormData(event.currentTarget));
    });
  }

  function refreshProductResults() {
    const results = productResults();
    const container = document.querySelector(".product-results");
    if (container) {
      container.innerHTML = renderProductResults(results);
      container.querySelectorAll("[data-action='addCart']").forEach((el) => el.addEventListener("click", () => action(el)));
    }
    const badge = document.querySelector(".sale-catalog-panel .badge.blue");
    if (badge) badge.textContent = `${results.length} articles`;
  }

  function refreshStockTree() {
    const tree = document.querySelector(".stock-tree");
    if (tree) {
      tree.innerHTML = renderStockTree();
      tree.querySelectorAll("[data-action='toggleTree']").forEach((el) => el.addEventListener("click", () => action(el)));
    }
  }

  function refreshCartMath() {
    document.querySelectorAll(".cart-row").forEach((row) => {
      const item = state.cart[Number(row.dataset.index)];
      const delta = item ? cartItemDelta(item) : 0;
      const deltaEl = row.querySelector(".delta");
      if (deltaEl) {
        deltaEl.outerHTML = renderDelta(delta);
      }
    });
    const summary = document.querySelector(".cart-summary");
    if (summary) summary.outerHTML = renderCartSummary(cartTotals());
    const pill = document.querySelector(".cart-pill");
    if (pill) {
      const items = cartTotals().items;
      pill.textContent = `${items} unité${items > 1 ? "s" : ""}`;
    }
  }

  async function action(el) {
    const a = el.dataset.action;
    if (a === "toggleTheme") return toggleTheme();
    if (a === "logout") return logout();
    if (a === "addCart") return addCart(el.dataset.id);
    if (a === "removeCart") return removeCart(Number(el.dataset.index));
    if (a === "dashboardNav") return dashboardNav(el);
    if (a === "dashboardSale") return dashboardSale(el.dataset.saleId);
    if (a === "dashboardType") return openTypeInCatalog(el.dataset.typeId);
    if (a === "dashboardCategory") return openCategoryInCatalog(el.dataset.categoryId);
    if (a === "dashboardAlert") return openTypeInStock(el.dataset.typeId);
    if (a === "viewSale") { state.selectedSaleId = el.dataset.id; return render(); }
    if (a === "viewEntry") { state.selectedEntryId = el.dataset.id; await api(`/api/stock-entries/${el.dataset.id}/view`, { method: "POST", body: {} }).catch(() => null); state.data = await api("/api/bootstrap"); return render(); }
    if (a === "toggleTree") { state.expanded.has(el.dataset.id) ? state.expanded.delete(el.dataset.id) : state.expanded.add(el.dataset.id); return render(); }
    if (a === "closureToday") { state.closureDate = today; return render(); }
    if (a === "planningMode") { state.planningMode = state.planningMode === "week" ? "day" : "week"; return render(); }
    if (a === "stockDecision") return postDecision(`/api/stock-entries/${el.dataset.id}/decision`, { decision: el.dataset.decision });
    if (a === "saleDecision") return postDecision(`/api/sales/${el.dataset.id}/decision`, { decision: el.dataset.decision });
  }

  function dashboardNav(el) {
    let target = el.dataset.target || "dashboard";
    if (!roleCanView(target)) {
      if (target === "sales") target = roleCanView("closures") ? "closures" : "dashboard";
      else if (target === "catalog") target = roleCanView("stock") ? "stock" : "dashboard";
      else target = "dashboard";
    }
    state.view = target;
    if (target === "sales" && el.dataset.date) state.saleDate = el.dataset.date;
    if (target === "closures" && el.dataset.date) state.closureDate = el.dataset.date;
    render();
  }

  function dashboardSale(saleId) {
    const sale = state.data.sales.find((item) => item.id === saleId);
    if (!sale) return;
    if (!roleCanView("sales")) {
      state.closureDate = sale.createdAt.slice(0, 10);
      state.view = roleCanView("closures") ? "closures" : "dashboard";
      return render();
    }
    state.selectedSaleId = sale.id;
    state.saleDate = sale.createdAt.slice(0, 10);
    state.view = "sales";
    render();
  }

  function openCategoryInCatalog(categoryId) {
    if (!categoryId) return;
    if (!roleCanView("catalog")) {
      state.view = roleCanView("stock") ? "stock" : "dashboard";
      state.stockQuery = "";
      state.expanded.add(categoryId);
      return render();
    }
    state.view = "catalog";
    state.catalogCategory = categoryId;
    state.catalogSubcategory = "";
    state.expanded.add(categoryId);
    render();
  }

  function openTypeInCatalog(typeId) {
    if (!roleCanView("catalog")) return openTypeInStock(typeId);
    const type = typeById(typeId);
    const sub = type ? subcategoryById(type.subcategoryId) : null;
    const cat = sub ? categoryById(sub.categoryId) : null;
    if (!type) return;
    state.view = "catalog";
    state.catalogCategory = cat?.id || "";
    state.catalogSubcategory = sub?.id || "";
    if (cat) state.expanded.add(cat.id);
    if (sub) state.expanded.add(sub.id);
    render();
  }

  function roleCanView(view) {
    return nav[state.data?.me?.role]?.some(([id]) => id === view);
  }

  function openTypeInStock(typeId) {
    const type = typeById(typeId);
    const sub = type ? subcategoryById(type.subcategoryId) : null;
    const cat = sub ? categoryById(sub.categoryId) : null;
    if (!type) return;
    state.view = "stock";
    state.stockQuery = "";
    if (cat) state.expanded.add(cat.id);
    if (sub) state.expanded.add(sub.id);
    state.expanded.add(`stock-type-${type.id}`);
    render();
  }

  async function login(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/login", { method: "POST", body: { username: form.get("username"), password: form.get("password") } });
      state.data = await api("/api/bootstrap");
      state.view = nav[state.data.me.role][0][0];
      render();
    } catch (error) {
      notify(error.message === "password_min_8" ? "Mot de passe: 8 caractères minimum." : "Connexion refusée.");
    }
  }

  async function logout() {
    await api("/api/logout", { method: "POST", body: {} }).catch(() => null);
    state.data = null;
    state.cart = [];
    render();
  }

  async function postDecision(path, body) {
    try {
      state.data = await api(path, { method: "POST", body });
      notify("Action enregistrée.");
      render();
    } catch (error) {
      notify(error.message);
    }
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    localStorage.setItem("inventory_theme", state.theme);
    render();
  }

  function addCart(id) {
    const variant = variantById(id);
    const existing = state.cart.find((item) => item.variantId === id);
    if (existing) existing.quantity += 1;
    else state.cart.push({ variantId: id, quantity: 1, soldPrice: priceFor(variant).applicablePrice });
    render();
  }

  function removeCart(index) {
    state.cart.splice(index, 1);
    render();
  }

  function updateCart(event) {
    state.cart[Number(event.target.dataset.cart)][event.target.dataset.field] = Number(event.target.value);
    refreshCartMath();
  }

  async function submitSale(form) {
    try {
      state.data = await api("/api/sales", { method: "POST", body: { clientName: form.get("clientName"), contact: form.get("contact"), lines: state.cart } });
      state.cart = [];
      notify("Vente enregistrée.");
      render();
    } catch (error) { notify(error.message); }
  }

  async function submitStock(form) {
    state.data = await api("/api/stock-entries", { method: "POST", body: { variantId: form.get("variantId"), quantity: Number(form.get("quantity")), comment: form.get("comment") } });
    notify("Entrée stock envoyée.");
    render();
  }

  async function submitType(form) {
    state.data = await api("/api/types", { method: "POST", body: { subcategoryId: form.get("subcategoryId"), name: form.get("name"), referenceQty: Number(form.get("referenceQty")) } });
    render();
  }

  async function submitVariant(form) {
    state.data = await api("/api/variants", { method: "POST", body: { typeId: form.get("typeId"), name: form.get("name"), referencePrice: Number(form.get("referencePrice")) } });
    render();
  }

  async function submitPromo(form) {
    const [targetScope, targetId] = form.get("target").split(":");
    state.data = await api("/api/promotions", { method: "POST", body: { label: form.get("label"), targetScope, targetId, discountPercent: Number(form.get("discountPercent")), startDate: form.get("startDate"), endDate: form.get("endDate") } });
    render();
  }

  async function submitUser(form) {
    try {
      state.data = await api("/api/users", { method: "POST", body: Object.fromEntries(form.entries()) });
      notify("Utilisateur créé.");
      render();
    } catch (error) { notify(error.message); }
  }

  async function submitShiftSlot(form) {
    try {
      state.data = await api("/api/shift-slots", { method: "POST", body: Object.fromEntries(form.entries()) });
      notify("Plage horaire créée.");
      render();
    } catch (error) { notify(error.message); }
  }

  async function submitShop(form) {
    const body = Object.fromEntries(form.entries());
    body.logoData = await fileData(form.get("logoFile"));
    body.hours = hoursFromForm(form);
    state.data = await api("/api/shops", { method: "POST", body });
    notify("Shop créé.");
    render();
  }

  async function submitSettings(form) {
    const body = Object.fromEntries(form.entries());
    const logoData = await fileData(form.get("logoFile"));
    if (logoData) body.logoData = logoData;
    body.hours = hoursFromForm(form);
    state.data = await api(`/api/shops/${state.data.shop.id}`, { method: "PATCH", body });
    notify("Paramètres enregistrés.");
    render();
  }

  async function submitClosure(form) {
    const date = form.get("date");
    if (date > today) return notify("Impossible de clôturer une date future.");
    try {
      state.data = await api("/api/closures", { method: "POST", body: { date, comment: form.get("comment") } });
      notify("Clôture enregistrée.");
      render();
    } catch (error) { notify(error.message); }
  }

  function bindDragDrop() {
    document.querySelectorAll(".drag-user").forEach((user) => user.addEventListener("dragstart", (event) => event.dataTransfer.setData("userId", user.dataset.user)));
    document.querySelectorAll(".drop-slot").forEach((slot) => {
      slot.addEventListener("dragover", (event) => event.preventDefault());
      slot.addEventListener("drop", async (event) => {
      event.preventDefault();
      if (state.data.me.role !== "shop_admin") return;
      const userId = event.dataTransfer.getData("userId");
      state.data = await api("/api/planning", { method: "POST", body: { userId, date: slot.dataset.date, slotId: slot.dataset.slotId } });
      render();
      });
    });
  }

  function annotateTables() {
    document.querySelectorAll("table").forEach((table) => {
      const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
      table.querySelectorAll("tbody tr").forEach((row) => Array.from(row.children).forEach((cell, index) => headers[index] && cell.setAttribute("data-label", headers[index])));
    });
  }

  function productResults() {
    const q = normalizeSearch(state.productQuery);
    return state.data.variants.filter((variant) => {
      if (!q) return true;
      const type = typeById(variant.typeId);
      const sub = type ? subcategoryById(type.subcategoryId) : null;
      const cat = sub ? categoryById(sub.categoryId) : null;
      return normalizeSearch([variant.name, variant.sku, type?.name, sub?.name, cat?.name].join(" ")).includes(q);
    });
  }

  function priceFor(variant) {
    const promo = activePromo(variant);
    const referencePrice = Number(variant.referencePrice);
    if (!promo) return { referencePrice, promotionId: null, applicablePrice: referencePrice };
    return { referencePrice, promotionId: promo.id, applicablePrice: Number((referencePrice * (1 - Number(promo.discountPercent) / 100)).toFixed(2)) };
  }

  function activePromo(variant) {
    const type = typeById(variant.typeId);
    const sub = type ? subcategoryById(type.subcategoryId) : null;
    const cat = sub ? categoryById(sub.categoryId) : null;
    const rank = { category: 1, subcategory: 2, type: 3, variant: 4 };
    return state.data.promotions.filter((promo) => promo.status === "active" && promo.startDate <= today && promo.endDate >= today).filter((promo) => {
      if (promo.targetScope === "variant") return promo.targetId === variant.id;
      if (promo.targetScope === "type") return promo.targetId === type?.id;
      if (promo.targetScope === "subcategory") return promo.targetId === sub?.id;
      if (promo.targetScope === "category") return promo.targetId === cat?.id;
      return false;
    }).sort((a, b) => rank[b.targetScope] - rank[a.targetScope])[0];
  }

  function promoTargets() {
    return [
      ...state.data.categories.map((item) => [`category:${item.id}`, `Catégorie · ${item.name}`]),
      ...state.data.subcategories.map((item) => [`subcategory:${item.id}`, `Sous-catégorie · ${item.name}`]),
      ...state.data.types.map((item) => [`type:${item.id}`, `Type · ${item.name}`]),
      ...state.data.variants.map((item) => [`variant:${item.id}`, `Variante · ${item.name}`]),
    ].map(([value, text]) => `<option value="${value}">${escape(text)}</option>`).join("");
  }

  function targetName(scope, id) {
    return { category: categoryById, subcategory: subcategoryById, type: typeById, variant: variantById }[scope]?.(id)?.name || id;
  }

  function hoursFromForm(form) {
    const keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    return Object.fromEntries(keys.map((key) => [key, { open: form.get(`${key}_open`) || "08:00", close: form.get(`${key}_close`) || "18:00", closed: form.get(`${key}_closed`) === "on" }]));
  }

  function fileData(file) {
    return new Promise((resolve) => {
      if (!file || !file.size) return resolve("");
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
  }

  function weekDays(date) {
    const base = new Date(`${date}T00:00:00`);
    const day = base.getDay() || 7;
    base.setDate(base.getDate() - day + 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }

  function userChipStyle(user) {
    return `--user-color: ${userColor(user?.id || user?.name || "")};`;
  }

  function userColor(seed) {
    const palette = ["#0b6b55", "#185a88", "#9b4d96", "#b85f22", "#3867d6", "#198754", "#b53838", "#6f42c1", "#0f766e", "#a16207"];
    let hash = 0;
    for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
  }

  function userInitials(name) {
    return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
  }

  function mappedDay(date) {
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][new Date(`${date}T00:00:00`).getDay()];
  }

  function startOfWeek(date) { return weekDays(date)[0]; }

  function addDays(date, delta) {
    const value = new Date(`${date}T00:00:00`);
    value.setDate(value.getDate() + delta);
    return value.toISOString().slice(0, 10);
  }

  function periodStats(sales, start, end) {
    return sales.filter((sale) => sale.createdAt.slice(0, 10) >= start && sale.createdAt.slice(0, 10) <= end && sale.status === "completed").reduce((acc, sale) => {
      const totals = totalsForSale(sale);
      acc.revenue += totals.sold;
      acc.expected += totals.expected;
      acc.sales += 1;
      acc.items += totals.quantity;
      return acc;
    }, { revenue: 0, expected: 0, sales: 0, items: 0 });
  }

  function salesTrend(days) {
    return Array.from({ length: days }, (_, index) => {
      const date = addDays(today, index - days + 1);
      return { date, label: shortDay(date), ...periodStats(state.data.sales, date, date) };
    });
  }

  function categoryRevenueRows(sales) {
    const map = new Map();
    sales.filter((sale) => sale.status === "completed").forEach((sale) => sale.lines.forEach((line) => {
      const variant = variantById(line.variantId);
      const type = variant ? typeById(variant.typeId) : null;
      const sub = type ? subcategoryById(type.subcategoryId) : null;
      const category = sub ? categoryById(sub.categoryId) : null;
      if (!category) return;
      const item = map.get(category.id) || { categoryId: category.id, name: category.name, revenue: 0, quantity: 0 };
      item.revenue += Number(line.soldPrice || 0) * Number(line.quantity || 0);
      item.quantity += Number(line.quantity || 0);
      map.set(category.id, item);
    }));
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }

  function topTypes(sales) {
    const map = new Map();
    sales.filter((sale) => sale.status === "completed").forEach((sale) => sale.lines.forEach((line) => {
      const variant = variantById(line.variantId);
      const type = variant ? typeById(variant.typeId) : null;
      if (!type) return;
      const item = map.get(type.id) || { id: type.id, name: type.name, qty: 0, revenue: 0 };
      item.qty += Number(line.quantity || 0);
      item.revenue += Number(line.soldPrice || 0) * Number(line.quantity || 0);
      map.set(type.id, item);
    }));
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }

  function bars(rows) {
    if (!rows.length) return `<div class="empty-state">Aucune donnée.</div>`;
    const max = Math.max(...rows.map((row) => row.qty), 1);
    return `<div class="bar-list">${rows.map((row) => `<div class="bar-row"><header><span>${escape(row.name)}</span><span>${row.qty}</span></header><div class="bar-track"><div class="bar-fill" style="width:${Math.max(6, (row.qty / max) * 100)}%"></div></div></div>`).join("")}</div>`;
  }

  function kpi(label, value, sub, tone = "", options = {}) {
    const attrs = options.action ? ` type="button" data-action="${options.action}" data-target="${escape(options.target || "")}"${options.date ? ` data-date="${escape(options.date)}"` : ""}` : "";
    const tag = options.action ? "button" : "div";
    return `<${tag}${attrs} class="panel kpi ${tone} ${options.action ? "is-clickable" : ""}"><span>${escape(label)}</span><div><b>${escape(value)}</b><small>${escape(sub)}</small></div></${tag}>`;
  }

  function percentageChange(current, previous) {
    if (!previous && !current) return 0;
    if (!previous) return 100;
    return ((current - previous) / previous) * 100;
  }

  function formatPercent(value) {
    const rounded = Math.round(Number(value || 0));
    return `${rounded > 0 ? "+" : ""}${rounded}%`;
  }

  function shortDay(date) {
    return new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(new Date(`${date}T00:00:00`)).replace(".", "");
  }

  function badge(value) {
    const tone = ["completed", "validated", "success", "active"].includes(value) ? "success" : ["pending_admin_approval", "pending_responsable_validation"].includes(value) ? "warning" : ["rejected", "failed"].includes(value) ? "danger" : "blue";
    return `<span class="badge ${tone}">${escape(labels[value] || value)}</span>`;
  }

  function totalsForSale(sale) {
    return sale.lines.reduce((acc, line) => {
      acc.expected += Number(line.applicablePrice) * Number(line.quantity);
      acc.sold += Number(line.soldPrice) * Number(line.quantity);
      acc.quantity += Number(line.quantity);
      return acc;
    }, { expected: 0, sold: 0, quantity: 0 });
  }

  function cartTotals() {
    const totals = state.cart.reduce((acc, item) => {
      const variant = variantById(item.variantId);
      if (!variant) return acc;
      const price = priceFor(variant);
      const quantity = Number(item.quantity || 0);
      const sold = Number(item.soldPrice || 0);
      acc.items += quantity;
      acc.expected += price.applicablePrice * quantity;
      acc.sold += sold * quantity;
      return acc;
    }, { items: 0, expected: 0, sold: 0, delta: 0 });
    totals.delta = totals.sold - totals.expected;
    return totals;
  }

  function variantById(id) { return state.data.variants?.find((item) => item.id === id); }
  function typeById(id) { return state.data.types?.find((item) => item.id === id); }
  function subcategoryById(id) { return state.data.subcategories?.find((item) => item.id === id); }
  function categoryById(id) { return state.data.categories?.find((item) => item.id === id); }
  function userById(id) { return state.data.users?.find((item) => item.id === id); }
  function shopById(id) { return state.data.shops?.find((item) => item.id === id); }
  function normalizeSearch(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
  function roundMoney(value) { return Math.round(Number(value || 0) * 100) / 100; }
  function money(value) { return moneyFmt.format(Number(value || 0)); }
  function signedMoney(value) { return `${Number(value) > 0 ? "+" : ""}${money(value)}`; }
  function formatDate(value) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
  function escape(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
  function notify(message) { state.message = message; render(); setTimeout(() => { state.message = ""; render(); }, 2600); }
})();
