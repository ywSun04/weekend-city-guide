function clockText(time) {
  const match = String(time || "").match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : "14:00";
}

function weekendDateLabel(prefs) {
  const days = nextWeekendIsos();
  const iso = prefs.weekendDay === "周日" ? days.sunday : days.saturday;
  return `${prefs.weekendDay} ${iso}`;
}

function peopleReason(people) {
  if (people <= 1) return "适合一个人";
  if (people === 2) return "符合两人同行";
  if (people === 4) return "适合 3–4 人";
  return "适合小团体";
}

function commuteMinutes(item) {
  const city = cityMeta(item.city);
  if (item.lat == null || item.lon == null) return 25;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(item.lat - city.lat);
  const dLon = toRad(item.lon - city.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(city.lat)) * Math.cos(toRad(item.lat)) * Math.sin(dLon / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  return Math.max(12, Math.round(8 + km * 3.2));
}

function demoStats(id) {
  let hash = 0;
  String(id)
    .split("")
    .forEach((ch) => {
      hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    });
  return { gone: 48 + (hash % 160), fav: 16 + (hash % 72) };
}

const DEMO_NOTE = "演示数据，真实出行请以场馆为准。";

function durationText(item) {
  return item.duration || "约 2 小时";
}

function extraCosts(commute, people) {
  const perTransit = commute <= 18 ? 4 : commute <= 32 ? 6 : 8;
  return { transit: perTransit * Math.max(1, people), food: 50 };
}

function enrich(item, prefs) {
  const commute = commuteMinutes(item);
  const needReserve = item.category === "展览" || item.category === "演出";
  const crowding = item.indoor ? (needReserve ? "建议预约，中等拥挤" : "室内舒适") : "露天，无需预约";
  const ticket = needReserve ? (item.cost <= 0 ? "需预约 · 免费票" : "需预约 · 余票示意充足") : "即到即玩";
  const extras = extraCosts(commute, prefs.people);
  return {
    commute,
    needReserve,
    crowding,
    ticket,
    total: item.cost * Math.max(1, prefs.people),
    transit: extras.transit,
    food: extras.food,
    dateLabel: weekendDateLabel(prefs),
    clock: clockText(item.time),
    stats: demoStats(item.id)
  };
}

function demoHint() {
  return `<p class="weather-source">${DEMO_NOTE}</p>`;
}

function mapBlock(item, prefs) {
  if (!item || item.lat == null) {
    if (typeof item === "number") return "";
    return "";
  }
  const info = enrich(item, prefs || getPrefs());
  return `
    <div class="route-card">
      <div class="kicker">静态路线卡 · 不用等地图加载</div>
      <h3>${esc(item.meetup)}</h3>
      <p class="lede">${esc(info.dateLabel)} ${info.clock} 集合 · 市中心出发约 ${info.commute} 分钟</p>
      ${demoHint()}
      <div class="row-actions">
        <a class="primary-btn" href="${amapLink(item.lat, item.lon, item.meetup)}" target="_blank" rel="noopener">高德导航</a>
      </div>
    </div>
  `;
}

function routeStops(list) {
  return (list || []).filter((item) => item.lat != null && item.lon != null).slice(0, 4);
}

function routeSection(stops, prefs) {
  const currentPrefs = prefs || getPrefs();
  if (!stops || !stops.length) return "";
  if (stops.length === 1) return mapBlock(stops[0], currentPrefs);
  return `
    <section class="panel">
      <span class="kicker">静态路线卡 v20260917c</span>
      <h3>周末候选集合</h3>
      <p class="lede">这不是同一天连走的行程。每个点有自己的建议到场时间和游览时长，请只选其中一个出发。</p>
      <ol class="route-list">
        ${stops
          .map((item, index) => {
            const info = enrich(item, currentPrefs);
            return `<li>
              <b>${index + 1}. ${esc(item.title)}</b>
              <span>${info.clock} 建议到场 · 游览 ${esc(durationText(item))} · 市中心出发约 ${info.commute} 分钟</span>
              <span>${esc(item.meetup)}</span>
              <a class="ghost-btn" href="${amapLink(item.lat, item.lon, item.meetup)}" target="_blank" rel="noopener">高德导航</a>
            </li>`;
          })
          .join("")}
      </ol>
      ${demoHint()}
    </section>
  `;
}

function reasons(item, prefs, weather) {
  const info = enrich(item, prefs);
  const chips = [peopleReason(prefs.people), item.cost <= 0 ? "免费" : `¥${item.cost}`];
  chips.push(item.indoor ? (weather.outdoorOk ? "室内" : "室内避雨") : "户外");
  chips.push(`市中心出发 ${info.commute} 分钟`);
  return chips;
}

function actionLabel(item, prefs) {
  return `${prefs.weekendDay} ${clockText(item.time)} 去${item.title}`;
}

function ctaBar(item, prefs, extra) {
  if (!item) return "";
  return `
    <section class="cta-bar">
      <div>
        <div class="kicker">立刻出发</div>
        <strong>${esc(actionLabel(item, prefs))}</strong>
      </div>
      <div class="row-actions">
        <button class="primary-btn" data-open="${item.id}">就去这个</button>
        ${extra || ""}
      </div>
    </section>
  `;
}

function planBSection(prefs, rec) {
  const pick = rec.primary[0];
  const alt = rec.planB;
  if (!pick || !alt || pick.id === alt.id) return "";
  const a = enrich(pick, prefs);
  const b = enrich(alt, prefs);
  const commuteDelta = a.commute - b.commute;
  const commuteLine = commuteDelta > 0 ? `通勤少 ${commuteDelta} 分钟` : commuteDelta < 0 ? `通勤多 ${Math.abs(commuteDelta)} 分钟` : "通勤接近";
  const budgetLine = a.total === b.total ? "票务预算不变" : b.total < a.total ? `票务预算少 ¥${a.total - b.total}` : `票务预算多 ¥${b.total - a.total}`;
  return `
    <section class="panel plan-b">
      <span class="kicker">Plan B</span>
      <h3>${rec.weather.outdoorOk ? "如果下雨，改走这条" : "这天偏湿，直接走室内线"}</h3>
      <p class="lede">${esc(pick.title)} → ${esc(alt.title)}。${budgetLine}，${commuteLine}。</p>
      <button class="secondary-btn" data-open="${alt.id}">改去 ${esc(alt.title)}</button>
    </section>
  `;
}

function weatherUpdatedText(bundle) {
  if (bundle.source === "Open-Meteo" && bundle.fetchedAt) {
    return `预报更新于 ${new Date(bundle.fetchedAt).toLocaleString("zh-CN")} · Open-Meteo`;
  }
  return "备用天气 · 非实时，网络恢复后会换成预报";
}

function weatherBar(prefs, extra) {
  const bundle = getWeather(prefs.city);
  const current = dayWeather(prefs);
  const days = [bundle.saturday, bundle.sunday];
  const iso = prefs.weekendDay === "周日" ? nextWeekendIsos().sunday : nextWeekendIsos().saturday;
  return `
    <section class="weather-bar">
      <div>
        <div class="weather-days">
          ${days
            .map(
              (day) =>
                `<button class="weather-day ${prefs.weekendDay === day.day ? "active" : ""}" data-weekend-day="${day.day}">${day.day} ${day.sky} ${day.temp}°C</button>`
            )
            .join("")}
        </div>
        <strong>${esc(current.text)}</strong>
        <div>${esc(current.tip)}</div>
        <div class="weather-source">适用于 ${iso}（${esc(prefs.weekendDay)}）· ${weatherUpdatedText(bundle)} · ${DEMO_NOTE}</div>
      </div>
      ${extra || ""}
    </section>
  `;
}

function scoreActivity(item, prefs, weather) {
  let score = 0;
  if (prefs.interests.includes(item.category)) score += 5;
  if (item.cost <= prefs.budget) score += 3;
  if (prefs.people >= item.minPeople && prefs.people <= item.maxPeople) score += 2;
  if (item.indoor && !weather.outdoorOk) score += 4;
  score -= commuteMinutes(item) / 40;
  return score;
}

function isHardMatch(item, prefs, weather) {
  return (
    item.cost <= prefs.budget &&
    prefs.people >= item.minPeople &&
    prefs.people <= item.maxPeople &&
    prefs.interests.includes(item.category) &&
    !(prefs.weatherSensitive && !weather.outdoorOk && !item.indoor)
  );
}

function recommend(prefs) {
  const weather = dayWeather(prefs);
  const cityItems = GUIDE_DATA.activities.filter((item) => item.city === prefs.city);
  const matched = cityItems
    .filter((item) => isHardMatch(item, prefs, weather))
    .sort((a, b) => scoreActivity(b, prefs, weather) - scoreActivity(a, prefs, weather) || a.cost - b.cost);
  const primary = matched.slice(0, 3);
  const backup = matched.slice(3, 5);
  const planB = cityItems
    .filter(
      (item) =>
        item.indoor &&
        item.cost <= prefs.budget &&
        prefs.people >= item.minPeople &&
        prefs.people <= item.maxPeople &&
        item.id !== (primary[0] && primary[0].id)
    )
    .sort((a, b) => commuteMinutes(a) - commuteMinutes(b) || a.cost - b.cost)[0];
  const rain = cityItems
    .filter(
      (item) =>
        item.indoor &&
        item.cost <= prefs.budget &&
        prefs.people >= item.minPeople &&
        prefs.people <= item.maxPeople &&
        !primary.some((row) => row.id === item.id)
    )
    .slice(0, 3);
  return {
    weather,
    primary,
    backup,
    planB: planB || null,
    rain,
    list: primary.concat(backup)
  };
}

function seedTeam(city) {
  const act =
    GUIDE_DATA.activities.find((item) => item.city === city && item.indoor && item.category === "展览") ||
    GUIDE_DATA.activities.find((item) => item.city === city);
  return {
    code: "DEMO",
    name: `${city}避雨小队（示例）`,
    activityId: act ? act.id : "",
    members: ["阿年", "小林"],
    note: act ? `集合：${act.meetup}。本机演示数据，队码不能让另一台设备加入。` : "本机演示数据。",
    demo: true
  };
}

function cardHtml(item, prefs, weather, kind) {
  const info = enrich(item, prefs);
  const chips = reasons(item, prefs, weather);
  return `
    <article class="card" data-open="${item.id}">
      <div class="meta">
        <span class="tag">${kind === "backup" ? "备选" : "主推"}</span>
        <span class="tag">${item.category}</span>
        <span>${esc(info.dateLabel)} ${info.clock}</span>
      </div>
      <h3>${esc(item.title)}</h3>
      <p class="lede">${esc(item.desc)}</p>
      <div class="reason-row">${chips.map((chip) => `<span class="reason">${esc(chip)}</span>`).join("")}</div>
      <div class="meta">
        <span class="price">${item.cost <= 0 ? "免费" : `人均 ¥${item.cost} · 活动票务预算 ¥${info.total}`}</span>
        <span>预计交通 ¥${info.transit}</span>
        <span>可选餐饮 ¥${info.food}</span>
        <span>${info.ticket}</span>
        <span>${info.crowding}</span>
      </div>
    </article>
  `;
}

function rainCard(item, prefs) {
  const info = enrich(item, prefs);
  return `<div class="list-item" data-open="${item.id}"><div><b>${esc(item.title)}</b><div class="lede">雨天备选 · ${formatCost(item.cost)} · 市中心出发约 ${info.commute} 分钟 · ${esc(item.meetup)}</div></div><span class="tag">室内</span></div>`;
}

function renderHome() {
  const prefs = getPrefs();
  const rec = recommend(prefs);
  const pick = rec.primary[0];
  const checkins = getCheckins();
  app.innerHTML = shell(
    "home",
    `
    <section class="hero">
      <span class="kicker">本地生活决策工具</span>
      <h1>把碎片活动收成一份能立刻出发的周末计划。</h1>
      <p class="lede">不是活动信息流。按偏好、天气和同行约束筛出主推，不适配的不硬凑。</p>
      ${
        pick
          ? ctaBar(pick, prefs, `<button class="ghost-btn" data-go="#/plan">改偏好</button>`)
          : `<div class="hero-actions"><button class="primary-btn" data-go="#/plan">开始规划</button></div>`
      }
      <div class="stat-row">
        <div class="stat"><b>${esc(prefs.city)}</b><span>当前城市</span></div>
        <div class="stat"><b>${rec.primary.length}</b><span>主推活动</span></div>
        <div class="stat"><b>${checkins.length}</b><span>已打卡</span></div>
      </div>
    </section>
    ${weatherBar(prefs)}
    <section class="panel">
      <h3>换一座城市看看</h3>
      <div class="choice-row" data-field="city">
        ${GUIDE_DATA.cities
          .map((city) => `<button class="chip ${prefs.city === city ? "active" : ""}" data-value="${city}">${city}</button>`)
          .join("")}
      </div>
    </section>
    `
  );
  app.querySelectorAll("[data-field='city'] .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = getPrefs();
      next.city = btn.dataset.value;
      savePrefs(next);
      delete weatherMemory[next.city];
      renderHome();
      refreshWeatherThenRerender();
    });
  });
}

function renderResults() {
  const prefs = getPrefs();
  const rec = recommend(prefs);
  const pick = rec.primary[0];
  const stops = routeStops(rec.list);
  app.innerHTML = shell(
    "results",
    `
    ${weatherBar(prefs, `<button class="ghost-btn" data-go="#/plan">改偏好</button>`)}
    ${
      rec.list.length
        ? `${ctaBar(pick, prefs)}
    <section class="panel">
      <span class="kicker">${esc(prefs.city)} · ${esc(prefs.weekendDay)}</span>
      <h2>主推 ${rec.primary.length} 个，备选 ${rec.backup.length} 个</h2>
      <p class="lede">只展示完全匹配城市、兴趣、预算、人数${prefs.weatherSensitive && !rec.weather.outdoorOk ? "和室内避雨" : ""}的活动。不拿徒步凑数。</p>
      ${demoHint()}
    </section>
    <section class="cards">${rec.primary.map((item) => cardHtml(item, prefs, rec.weather, "primary")).join("")}</section>
    ${
      rec.backup.length
        ? `<section class="panel"><h3>备选 2 个</h3><p class="lede">同样符合条件，只是排序靠后。</p></section><section class="cards">${rec.backup.map((item) => cardHtml(item, prefs, rec.weather, "backup")).join("")}</section>`
        : ""
    }
    ${planBSection(prefs, rec)}
    ${
      rec.rain.length
        ? `<section class="panel rain-panel"><span class="kicker">雨天备选</span><h3>不适配户外时走这些</h3>${rec.rain.map((item) => rainCard(item, prefs)).join("")}</section>`
        : ""
    }
    ${routeSection(stops, prefs)}`
        : emptyState("没有完全匹配的活动", "不会为了凑数塞进徒步或超预算项目。请放宽预算、加一个兴趣，或关掉天气敏感。", "改偏好", "#/plan")
    }
    `
  );
}

function renderDetail(id) {
  const item = byId(id);
  if (!item) {
    app.innerHTML = shell("results", emptyState("没有找到这个活动", "回到推荐页再选一次。", "返回推荐", "#/results"));
    return;
  }
  const prefs = { ...getPrefs(), city: item.city };
  const weather = dayWeather(prefs);
  const rec = recommend(prefs);
  const info = enrich(item, prefs);
  const checked = getCheckins().some((row) => row.activityId === item.id);
  const match = isHardMatch(item, prefs, weather);
  app.innerHTML = shell(
    "results",
    `
    <section class="panel">
      <span class="kicker">${esc(item.city)} · ${item.category}${match ? "" : " · 非当前筛选主推"}</span>
      <h2>${esc(item.title)}</h2>
      <p class="lede">${esc(item.desc)}</p>
      ${ctaBar(item, prefs, `<button class="ghost-btn" data-share-from="${item.id}">分享攻略</button>`)}
      ${weatherBar(prefs)}
      <div class="reason-row">${reasons(item, prefs, weather)
        .map((chip) => `<span class="reason">${esc(chip)}</span>`)
        .join("")}</div>
      <div class="detail-grid">
        <div><span>日期</span><b>${esc(info.dateLabel)} ${info.clock}</b></div>
        <div><span>通勤</span><b>市中心出发约 ${info.commute} 分钟</b></div>
        <div><span>预约 / 余票</span><b>${esc(info.ticket)}</b></div>
        <div><span>拥挤度</span><b>${esc(info.crowding)}</b></div>
        <div><span>活动票务预算</span><b>${item.cost <= 0 ? "免费" : `¥${info.total} / ${prefs.people} 人`}</b></div>
        <div><span>预计交通 / 餐饮</span><b>交通 ¥${info.transit} · 可选餐饮 ¥${info.food}</b></div>
      </div>
      <p class="lede">已去过 ${info.stats.gone} 人｜收藏 ${info.stats.fav}｜一句话攻略：${esc(item.vibe)}，${item.indoor ? "室内好集合" : "记得看天气"}。</p>
      ${demoHint()}
      ${mapBlock(item, prefs)}
      ${planBSection(prefs, rec)}
      <div class="row-actions">
        <button class="primary-btn" data-checkin="${item.id}">${checked ? "已打卡，看足迹海报" : "去过，打卡"}</button>
        <button class="secondary-btn" data-team-from="${item.id}">组队（本机演示）</button>
        <button class="ghost-btn" data-share-from="${item.id}">一句话攻略</button>
      </div>
    </section>
    `
  );
}

function renderTeam() {
  const prefs = getPrefs();
  const nickname = getNickname();
  const rec = recommend(prefs);
  const pick = rec.primary[0] || GUIDE_DATA.activities.find((item) => item.city === prefs.city);
  const demo = seedTeam(prefs.city);
  const mine = getTeams();
  app.innerHTML = shell(
    "team",
    `
    <section class="panel demo-banner">
      <span class="kicker">本机演示模式</span>
      <h2>小队只存在这台浏览器</h2>
      <p class="lede">没有云端数据库，把队码发给另一台手机无法真正加入。下面预置了示例小队，用来看组队长什么样。</p>
    </section>
    <section class="panel">
      <h3>示例小队</h3>
      <div class="list-item">
        <div>
          <b>${esc(demo.name)}</b>
          <div class="lede">队码 ${demo.code} · ${esc(byId(demo.activityId) ? byId(demo.activityId).title : "")} · ${esc(demo.members.join("、"))}</div>
          <div class="lede">${esc(demo.note)}</div>
        </div>
      </div>
    </section>
    <section class="panel">
      <h3>在本机创建演示小队</h3>
      <div class="field"><label>你的称呼</label><input class="text-input" id="nickname" value="${esc(nickname)}" placeholder="例如：阿年"></div>
      <div class="field"><label>小队名称</label><input class="text-input" id="team-name" value="${esc(prefs.city)}周末小队"></div>
      <div class="field">
        <label>关联活动</label>
        <select class="text-input" id="team-activity">
          ${GUIDE_DATA.activities
            .filter((item) => item.city === prefs.city)
            .map((item) => `<option value="${item.id}" ${pick && pick.id === item.id ? "selected" : ""}>${esc(item.title)}</option>`)
            .join("")}
        </select>
      </div>
      <div class="field"><label>一句话约定</label><input class="text-input" id="team-note" placeholder="例如：下午 1 点门口见"></div>
      <button class="primary-btn" id="create-team">创建本机小队</button>
    </section>
    <section class="panel">
      <h3>本机加入（仅当前浏览器）</h3>
      <div class="field"><label>4 位队码</label><input class="text-input" id="join-code" maxlength="4" placeholder="本机小队队码，不是 DEMO"></div>
      <button class="secondary-btn" id="join-team">加入本机小队</button>
    </section>
    <section class="panel">
      <h3>我创建的本机小队</h3>
      ${
        mine.length
          ? mine
              .map((team) => {
                const act = byId(team.activityId);
                return `<div class="list-item"><div><b>${esc(team.name)}</b><div class="lede">队码 ${esc(team.code)} · ${act ? esc(act.title) : ""} · ${esc(team.members.join("、"))}</div><div class="lede">${esc(team.note || "")}</div></div><button class="ghost-btn" data-copy="${esc(team.code)}">复制队码</button></div>`;
              })
              .join("")
          : `<p class="lede">还没有自己的小队。示例小队已经在上面，足够演示给面试官看。</p>`
      }
    </section>
    `
  );
  app.querySelector("#create-team").addEventListener("click", () => {
    const name = app.querySelector("#team-name").value.trim() || `${prefs.city}周末小队`;
    const nick = app.querySelector("#nickname").value.trim() || "匿名旅人";
    saveNickname(nick);
    const teamsNow = getTeams();
    teamsNow.unshift({
      id: String(Date.now()),
      code: Math.random().toString(36).slice(2, 6).toUpperCase(),
      name,
      activityId: app.querySelector("#team-activity").value,
      note: app.querySelector("#team-note").value.trim(),
      members: [nick],
      createdAt: new Date().toISOString()
    });
    saveTeams(teamsNow);
    toast("已在本机创建");
    renderTeam();
  });
  app.querySelector("#join-team").addEventListener("click", () => {
    const code = app.querySelector("#join-code").value.trim().toUpperCase();
    if (code === "DEMO") {
      toast("DEMO 是示例小队，无法跨设备加入");
      return;
    }
    const nick = app.querySelector("#nickname").value.trim() || "新加入的人";
    saveNickname(nick);
    const teamsNow = getTeams();
    const target = teamsNow.find((team) => team.code === code);
    if (!target) {
      toast("本机找不到这个队码");
      return;
    }
    if (!target.members.includes(nick)) target.members.push(nick);
    saveTeams(teamsNow);
    toast("已加入本机小队");
    renderTeam();
  });
}

function renderCheckins() {
  const checkins = getCheckins();
  const last = checkins[0] && byId(checkins[0].activityId);
  const prefs = getPrefs();
  app.innerHTML = shell(
    "account",
    `
    <section class="panel">
      <span class="kicker">打卡记录</span>
      <h2>去过的周末，收成足迹</h2>
      <p class="lede">打卡后可生成足迹海报并分享。这是决策之后的到场闭环。</p>
    </section>
    ${last ? `<section class="panel">${mapBlock(last, prefs)}<button class="primary-btn" data-go="#/poster/${last.id}">看足迹海报</button></section>` : ""}
    <section class="panel">
      ${
        checkins.length
          ? checkins
              .map((row) => {
                const item = byId(row.activityId);
                return `<div class="list-item"><div><b>${esc(row.title)}</b><div class="lede">${esc(row.city)} · ${new Date(row.at).toLocaleString("zh-CN")}</div></div>${
                  item ? `<button class="ghost-btn" data-go="#/poster/${item.id}">海报</button>` : ""
                }</div>`;
              })
              .join("")
          : emptyState("还没有打卡", "去过一次就在详情页打卡，完成后会出现足迹海报和分享。", "去看主推", "#/results")
      }
    </section>
    `
  );
}

function renderPoster(id) {
  const item = byId(id);
  const prefs = getPrefs();
  if (!item) {
    app.innerHTML = shell("account", emptyState("还没有这张海报", "先打卡一个活动。", "去推荐", "#/results"));
    return;
  }
  const info = enrich(item, prefs);
  app.innerHTML = shell(
    "account",
    `
    <section class="poster">
      <span class="kicker">本周末足迹</span>
      <h1>${esc(item.title)}</h1>
      <p>${esc(info.dateLabel)} ${info.clock} · ${esc(item.city)}</p>
      <p class="lede">一句话攻略：${esc(item.vibe)}。${item.indoor ? "室内好集合。" : "出门前看一眼天气。"} ${esc(item.meetup)}</p>
      <p class="weather-source">演示海报 · 可复制分享给好友</p>
    </section>
    <div class="row-actions">
      <button class="primary-btn" data-share-from="${item.id}">分享给好友</button>
      <button class="ghost-btn" data-go="#/checkins">返回打卡</button>
    </div>
    `
  );
}

function shareText(activityId) {
  const prefs = getPrefs();
  const rec = recommend(prefs);
  const bundle = getWeather(prefs.city);
  const focus = byId(activityId) || rec.primary[0];
  const stops = routeStops(rec.list);
  return [
    `【周末探城】${prefs.city} · ${weekendDateLabel(prefs)}`,
    `周六：${bundle.saturday.text}`,
    `周日：${bundle.sunday.text}`,
    rec.weather.tip,
    focus ? `立刻出发：${actionLabel(focus, prefs)}` : "还没有主推。",
    focus ? `理由：${reasons(focus, prefs, rec.weather).join(" ｜ ")}` : "",
    rec.planB ? `Plan B：${focus.title} → ${rec.planB.title}` : "",
    stops.length ? `路线：${stops.map((item, index) => `${index + 1}.${item.title}`).join(" → ")}` : "",
    "来源：周末探城。预报来自 Open-Meteo。"
  ]
    .filter(Boolean)
    .join("\n");
}

function checkin(id) {
  const item = byId(id);
  if (!item) return;
  const checkins = getCheckins();
  if (!checkins.some((row) => row.activityId === id)) {
    checkins.unshift({
      activityId: id,
      city: item.city,
      title: item.title,
      note: `${item.category} · ${item.vibe}`,
      at: new Date().toISOString()
    });
    saveCheckins(checkins);
  }
  toast("已打卡，生成足迹海报");
  setTimeout(() => go(`#/poster/${id}`), 0);
}

window.addEventListener("hashchange", function onProductHash() {
  render();
});
render();

function render() {
  const { page, id } = parseHash();
  if (page === "plan") renderPlan();
  else if (page === "results") renderResults();
  else if (page === "activity") renderDetail(id);
  else if (page === "team") renderTeam();
  else if (page === "checkins") renderCheckins();
  else if (page === "share") renderShare(id);
  else if (page === "poster") renderPoster(id);
  else if (page === "account") renderAccount();
  else renderHome();
  refreshWeatherThenRerender();
}

function renderWithoutWeatherLoop() {
  const { page, id } = parseHash();
  if (page === "plan") return renderPlan();
  if (page === "results") return renderResults();
  if (page === "activity") return renderDetail(id);
  if (page === "team") return renderTeam();
  if (page === "checkins") return renderCheckins();
  if (page === "share") return renderShare(id);
  if (page === "poster") return renderPoster(id);
  if (page === "account") return renderAccount();
  return renderHome();
}

function cacheWeather(city, weather) {
  weather.fetchedAt = Date.now();
  weatherMemory[city] = weather;
  const all = load(STORAGE.weather, {});
  all[city] = { fetchedAt: weather.fetchedAt, weather };
  save(STORAGE.weather, all);
}
