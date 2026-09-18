const STORAGE = {
  prefs: "weekend-guide-prefs",
  teams: "weekend-guide-teams",
  checkins: "weekend-guide-checkins",
  nickname: "weekend-guide-nickname",
  accounts: "weekend-guide-accounts",
  session: "weekend-guide-session",
  weather: "weekend-guide-weather-cache"
};

const CATEGORIES = ["展览", "市集", "演出", "徒步"];
const BUDGETS = [
  { label: "50 元内", value: 50 },
  { label: "150 元内", value: 150 },
  { label: "300 元内", value: 300 },
  { label: "不限", value: 9999 }
];
const PEOPLE = [
  { label: "就我一个", value: 1 },
  { label: "两人同行", value: 2 },
  { label: "3–4 人", value: 4 },
  { label: "5 人以上", value: 6 }
];
const WEATHER_TTL = 30 * 60 * 1000;
const weatherMemory = {};
const weatherInflight = {};

const app = document.getElementById("app");

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSession() {
  return load(STORAGE.session, null);
}

function scopedKey(base) {
  const session = getSession();
  return session ? `${base}:${session.username}` : base;
}

function defaultPrefs() {
  return {
    city: "上海",
    budget: 150,
    people: 2,
    interests: ["展览", "市集"],
    weatherSensitive: true,
    weekendDay: "周六"
  };
}

function getPrefs() {
  const scoped = load(scopedKey(STORAGE.prefs), null);
  if (scoped) return { ...defaultPrefs(), ...scoped };
  return { ...defaultPrefs(), ...load(STORAGE.prefs, {}) };
}

function savePrefs(next) {
  save(scopedKey(STORAGE.prefs), next);
}

function getTeams() {
  const scoped = load(scopedKey(STORAGE.teams), null);
  return scoped || load(STORAGE.teams, []);
}

function saveTeams(teams) {
  save(scopedKey(STORAGE.teams), teams);
}

function getCheckins() {
  const scoped = load(scopedKey(STORAGE.checkins), null);
  return scoped || load(STORAGE.checkins, []);
}

function saveCheckins(checkins) {
  save(scopedKey(STORAGE.checkins), checkins);
}

function getNickname() {
  const session = getSession();
  if (session) return session.nickname || session.username;
  return load(scopedKey(STORAGE.nickname), "") || load(STORAGE.nickname, "") || "";
}

function saveNickname(name) {
  save(scopedKey(STORAGE.nickname), name);
  const session = getSession();
  if (session) {
    session.nickname = name;
    save(STORAGE.session, session);
    const accounts = load(STORAGE.accounts, []);
    const found = accounts.find((item) => item.username === session.username);
    if (found) {
      found.nickname = name;
      save(STORAGE.accounts, accounts);
    }
  }
}

function hashPin(pin) {
  let hash = 0;
  const text = `weekend-guide:${pin}`;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return String(hash);
}

function cityMeta(name) {
  return GUIDE_DATA.cityMeta.find((item) => item.name === name) || GUIDE_DATA.cityMeta[0];
}

function oneDayFallback(city, label) {
  const base =
    GUIDE_DATA.weather[city] || {
      sky: "多云",
      temp: 24,
      outdoorOk: true,
      tip: "正在获取实时预报。"
    };
  const wet = !base.outdoorOk;
  return {
    day: label,
    sky: base.sky,
    temp: base.temp,
    outdoorOk: base.outdoorOk,
    rain: wet ? 60 : 20,
    text: `${label}${base.sky} ${base.temp}°C${wet ? "，建议室内或备伞" : "，适合出门"}`,
    tip: label === "周日" && wet ? "周日仍偏湿，室内展和剧场更稳妥。" : base.tip
  };
}

function fallbackWeekend(city) {
  return {
    saturday: oneDayFallback(city, "周六"),
    sunday: oneDayFallback(city, "周日"),
    source: GUIDE_DATA.weather[city] ? "备用" : "备用"
  };
}

function isWeekendBundle(weather) {
  return Boolean(weather && weather.saturday && weather.sunday);
}

function wmoLabel(code) {
  if (code === 0) return "晴";
  if (code <= 3) return "多云";
  if (code <= 48) return "有雾";
  if (code <= 57) return "毛毛雨";
  if (code <= 67) return "雨";
  if (code <= 77) return "雪";
  if (code <= 82) return "阵雨";
  if (code <= 86) return "阵雪";
  return "雷雨";
}

function isoFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayNum = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}

function nextWeekendIsos() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const add = day === 6 ? 0 : (6 - day + 7) % 7;
  date.setDate(date.getDate() + add);
  const saturday = isoFromDate(date);
  const sundayDate = new Date(date);
  sundayDate.setDate(date.getDate() + 1);
  return { saturday, sunday: isoFromDate(sundayDate) };
}

function getWeather(city) {
  const stored = weatherMemory[city];
  return isWeekendBundle(stored) ? stored : fallbackWeekend(city);
}

function dayWeather(prefs) {
  const bundle = getWeather(prefs.city);
  return prefs.weekendDay === "周日" ? bundle.sunday : bundle.saturday;
}

function cacheWeather(city, weather) {
  weatherMemory[city] = weather;
  const all = load(STORAGE.weather, {});
  all[city] = { fetchedAt: Date.now(), weather };
  save(STORAGE.weather, all);
}

function restoreWeatherCache() {
  const all = load(STORAGE.weather, {});
  Object.keys(all).forEach((city) => {
    if (
      all[city] &&
      Date.now() - all[city].fetchedAt < WEATHER_TTL &&
      isWeekendBundle(all[city].weather)
    ) {
      weatherMemory[city] = all[city].weather;
    }
  });
}

function parseDailyDay(json, iso, label) {
  const index = (json.daily.time || []).indexOf(iso);
  const i = index >= 0 ? index : label === "周日" ? 1 : 0;
  const code = json.daily.weather_code[i];
  const max = Math.round(json.daily.temperature_2m_max[i]);
  const min = Math.round(json.daily.temperature_2m_min[i]);
  const rain = json.daily.precipitation_probability_max[i] ?? 0;
  const sky = wmoLabel(code);
  const wet = rain >= 50 || code >= 61;
  const outdoorOk = !wet;
  const tip = outdoorOk
    ? `最高 ${max}°C / 最低 ${min}°C，降水概率 ${rain}%。户外和市集体感还可以。`
    : `最高 ${max}°C / 最低 ${min}°C，降水概率 ${rain}%。展览和剧场更稳妥，徒步请换备选。`;
  return {
    day: label,
    sky,
    temp: max,
    outdoorOk,
    rain,
    text: `${label}${sky} ${max}°C${wet ? "，建议室内或备伞" : "，适合出门"}`,
    tip
  };
}

async function fetchWeekendWeather(city) {
  const meta = cityMeta(city);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${meta.lat}&longitude=${meta.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FShanghai&forecast_days=8`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather http");
  const json = await res.json();
  const days = nextWeekendIsos();
  return {
    saturday: parseDailyDay(json, days.saturday, "周六"),
    sunday: parseDailyDay(json, days.sunday, "周日"),
    source: "Open-Meteo"
  };
}

async function ensureWeather(city) {
  if (isWeekendBundle(weatherMemory[city])) return false;
  const cached = load(STORAGE.weather, {})[city];
  if (cached && Date.now() - cached.fetchedAt < WEATHER_TTL && isWeekendBundle(cached.weather)) {
    weatherMemory[city] = cached.weather;
    return true;
  }
  if (weatherInflight[city]) return weatherInflight[city];
  weatherInflight[city] = fetchWeekendWeather(city)
    .then((weather) => {
      cacheWeather(city, weather);
      delete weatherInflight[city];
      return true;
    })
    .catch(() => {
      cacheWeather(city, fallbackWeekend(city));
      delete weatherInflight[city];
      return true;
    });
  return weatherInflight[city];
}

function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1800);
}

function parseHash() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const parts = raw.split("/").filter(Boolean);
  return { page: parts[0] || "home", id: parts[1] || "" };
}

function go(path) {
  location.hash = path;
}

function byId(id) {
  return GUIDE_DATA.activities.find((item) => item.id === id);
}

function formatCost(cost) {
  return cost <= 0 ? "免费" : `人均 ¥${cost}`;
}

function peopleLabel(min, max) {
  return `${min}–${max} 人`;
}

function mapEmbed(lat, lon) {
  const delta = 0.016;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - delta}%2C${lat - delta}%2C${lon + delta}%2C${lat + delta}&layer=mapnik&marker=${lat}%2C${lon}`;
}

function amapLink(lat, lon, name) {
  return `https://uri.amap.com/marker?position=${lon},${lat}&name=${encodeURIComponent(name)}`;
}

function osmLink(lat, lon) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

function mapBlock(lat, lon, name) {
  if (lat == null || lon == null) return "";
  return `
    <div class="map-wrap">
      <iframe class="map-frame" title="${esc(name)}地图" src="${mapEmbed(lat, lon)}" loading="lazy"></iframe>
      <div class="row-actions">
        <a class="secondary-btn" href="${amapLink(lat, lon, name)}" target="_blank" rel="noopener">高德导航</a>
        <a class="ghost-btn" href="${osmLink(lat, lon)}" target="_blank" rel="noopener">放大地图</a>
      </div>
    </div>
  `;
}

function parseClock(time) {
  const match = String(time || "").match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function routeStops(list) {
  return (list || []).filter((item) => item.lat != null && item.lon != null).slice(0, 4);
}

function routeSection(stops, prefs) {
  const currentPrefs = prefs || getPrefs();
  if (!stops || !stops.length) return "";
  const focus = stops[0];
  if (stops.length === 1 && focus) {
    return `<section class="panel"><h3>周末候选集合</h3><p class="lede">${esc(focus.title)} · ${esc(focus.meetup)}</p>
      <p class="lede">${(String(focus.time || "").match(/(\d{1,2}:\d{2})/) || [focus.time])[0]} 建议到场 · 游览 ${esc(focus.duration || "")}。这是单独选项，不是连走路线。</p>
      <a class="primary-btn" href="${amapLink(focus.lat, focus.lon, focus.meetup)}" target="_blank" rel="noopener">高德导航</a>
      <p class="weather-source">演示数据，真实出行请以场馆为准。</p>
    </section>`;
  }
  return `
    <section class="panel">
      <span class="kicker">静态路线卡</span>
      <h3>周末候选集合</h3>
      <p class="lede">这不是同一天连走的行程。每个点有自己的建议到场时间和游览时长，请只选其中一个出发。</p>
      <ol class="route-list">
        ${stops
          .map((item, index) => {
            const clock = String(item.time || "").match(/(\d{1,2}:\d{2})/);
            const clockLabel = clock ? clock[1] : item.time;
            return `<li>
              <b>${index + 1}. ${esc(item.title)}</b>
              <span>${clockLabel} 建议到场 · 游览 ${esc(item.duration || "")} · 市中心出发估算</span>
              <span>${esc(item.meetup)}</span>
              <a class="ghost-btn" href="${amapLink(item.lat, item.lon, item.meetup)}" target="_blank" rel="noopener">高德导航</a>
            </li>`;
          })
          .join("")}
      </ol>
      <p class="weather-source">演示数据，真实出行请以场馆为准。</p>
    </section>
  `;
}

function amapRoute(stops) {
  if (!stops.length) return "#";
  if (stops.length === 1) return amapLink(stops[0].lat, stops[0].lon, stops[0].title);
  const start = stops[0];
  const end = stops[stops.length - 1];
  const via = stops
    .slice(1, -1)
    .map((item) => `${item.lon},${item.lat}`)
    .join(";");
  const viaPart = via ? `&via=${via}` : "";
  return `https://uri.amap.com/navigation?from=${start.lon},${start.lat},${encodeURIComponent(start.title)}&to=${end.lon},${end.lat},${encodeURIComponent(end.title)}${viaPart}&mode=walk`;
}

function indoorBackups(prefs, excludeIds) {
  return GUIDE_DATA.activities
    .filter(
      (item) =>
        item.city === prefs.city &&
        item.indoor &&
        item.cost <= prefs.budget &&
        prefs.people >= item.minPeople &&
        prefs.people <= item.maxPeople &&
        !excludeIds.includes(item.id)
    )
    .slice(0, 3);
}

function rainSection(prefs, rec) {
  const day = dayWeather(prefs);
  const backups = indoorBackups(prefs, rec.list.map((item) => item.id));
  if (!backups.length) {
    if (day.outdoorOk) return "";
    return `<section class="panel rain-panel"><span class="kicker">雨天备选</span><h3>室内选项已经都在上面的推荐里</h3><p class="lede">把预算调宽，或再加一个兴趣，才能看到更多展馆和剧场。</p><button class="primary-btn" data-go="#/plan">改偏好</button></section>`;
  }
  return `
    <section class="panel rain-panel">
      <span class="kicker">雨天备选</span>
      <h3>${day.outdoorOk ? "如果这天下雨，改走室内线" : "这天偏湿，优先走这套室内备选"}</h3>
      <p class="lede">${
        day.outdoorOk
          ? "主线可以出门。真下雨时，把徒步和露天市集换成下面这几个室内点就行。"
          : "按你的预算和人数筛过的室内活动。户外先搁下，避免淋着走完全程。"
      }</p>
      ${backups
        .map(
          (item) =>
            `<div class="list-item" data-open="${item.id}"><div><b>${esc(item.title)}</b><div class="lede">${item.category} · ${formatCost(item.cost)} · ${esc(item.meetup)}</div></div><span class="tag">室内</span></div>`
        )
        .join("")}
    </section>
  `;
}

function emptyState(title, body, actionLabel, actionHash) {
  return `<section class="empty"><h2>${esc(title)}</h2><p>${esc(body)}</p><button class="primary-btn" data-go="${actionHash}">${esc(actionLabel)}</button></section>`;
}

function weatherBar(prefs, extra = "") {
  const bundle = getWeather(prefs.city);
  const current = dayWeather(prefs);
  const days = [bundle.saturday, bundle.sunday];
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
        <div class="weather-source">${bundle.source === "Open-Meteo" ? "实时预报 · Open-Meteo · 点上面切换周六/周日" : "备用天气 · 网络未连通时使用"}</div>
      </div>
      ${extra}
    </section>
  `;
}

function scoreActivity(item, prefs, weather) {
  let score = 0;
  if (prefs.interests.includes(item.category)) score += 5;
  if (item.cost <= prefs.budget) score += 3;
  if (prefs.people >= item.minPeople && prefs.people <= item.maxPeople) score += 2;
  if (prefs.weatherSensitive && !weather.outdoorOk && item.indoor) score += 4;
  if (prefs.weatherSensitive && weather.outdoorOk && !item.indoor) score += 2;
  if (!prefs.weatherSensitive) score += 1;
  return score;
}

function recommend(prefs) {
  const weather = dayWeather(prefs);
  const cityItems = GUIDE_DATA.activities.filter((item) => item.city === prefs.city);
  const ranked = cityItems
    .map((item) => ({ item, score: scoreActivity(item, prefs, weather) }))
    .sort((a, b) => b.score - a.score || a.item.cost - b.item.cost);

  const matched = ranked.filter((row) => {
    const fitBudget = row.item.cost <= prefs.budget;
    const fitPeople = prefs.people >= row.item.minPeople && prefs.people <= row.item.maxPeople;
    const fitInterest = prefs.interests.length === 0 || prefs.interests.includes(row.item.category);
    const fitWeather = !(prefs.weatherSensitive && !weather.outdoorOk && !row.item.indoor);
    return fitBudget && fitPeople && fitInterest && fitWeather;
  });

  let picked = matched;
  let relaxed = false;
  if (picked.length < 6) {
    const extra = ranked.filter((row) => !picked.includes(row));
    picked = picked.concat(extra).slice(0, 8);
    relaxed = true;
  } else {
    picked = picked.slice(0, 8);
  }

  return { weather, relaxed, list: picked.map((row) => row.item) };
}

function nav(active) {
  const items = [
    ["#/", "首页", "home"],
    ["#/plan", "偏好", "plan"],
    ["#/results", "推荐", "results"],
    ["#/team", "组队", "team"],
    ["#/account", "我的", "account"]
  ];
  return `<nav class="nav">${items
    .map(([href, label, key]) => `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`)
    .join("")}</nav>`;
}

function shell(active, content) {
  const session = getSession();
  return `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#/">
          <div class="brand-mark">探</div>
          <div>
            <strong>周末探城</strong>
            <small>城市探索指南</small>
          </div>
        </a>
        <div class="top-actions">
          <button class="ghost-btn" data-go="#/account">${session ? esc(session.nickname || session.username) : "登录"}</button>
          <button class="ghost-btn" data-go="#/share">攻略</button>
        </div>
      </header>
      ${content}
    </div>
    ${nav(active)}
  `;
}

function renderHome() {
  const prefs = getPrefs();
  const checkins = getCheckins();
  const teams = getTeams();
  const session = getSession();
  app.innerHTML = shell(
    "home",
    `
    <section class="hero">
      <span class="kicker">WEEKEND CITY GUIDE</span>
      <h1>周末去哪玩，先把天气和预算说清楚。</h1>
      <p class="lede">展览、市集、演出、短途徒步的信息太散。按城市、预算、人数和实时天气给出能出发的方案，并支持组队、打卡、地图导航和攻略分享。</p>
      <div class="hero-actions">
        <button class="primary-btn" data-go="#/plan">开始规划</button>
        <button class="secondary-btn" data-go="#/results">先看推荐</button>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${esc(prefs.city)}</b><span>当前城市</span></div>
        <div class="stat"><b>${GUIDE_DATA.cities.length}</b><span>已覆盖城市</span></div>
        <div class="stat"><b>${checkins.length}</b><span>${session ? "我的打卡" : "本地打卡"}</span></div>
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
      <p class="lede" style="margin-top:12px">小队 ${teams.length} 个 · ${session ? "已登录，记录记在你的名下" : "未登录，记录只留在这台设备"}</p>
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

function renderPlan() {
  const prefs = getPrefs();
  app.innerHTML = shell(
    "plan",
    `
    <section class="panel">
      <span class="kicker">STEP 01</span>
      <h2>告诉我这周末怎么玩</h2>
      <p class="lede">选择会硬筛推荐：兴趣、预算、人数、雨天室内。不匹配的活动不会被拿来凑数。</p>
      <div class="field">
        <label>城市</label>
        <div class="choice-row" data-field="city">
          ${GUIDE_DATA.cities
            .map((city) => `<button class="chip ${prefs.city === city ? "active" : ""}" data-value="${city}">${city}</button>`)
            .join("")}
        </div>
      </div>
      <div class="field">
        <label>出行日</label>
        <div class="choice-row" data-field="weekendDay">
          <button class="chip ${prefs.weekendDay === "周六" ? "active" : ""}" data-value="周六">周六</button>
          <button class="chip ${prefs.weekendDay === "周日" ? "active" : ""}" data-value="周日">周日</button>
        </div>
      </div>
      <div class="field">
        <label>预算</label>
        <div class="choice-row" data-field="budget">
          ${BUDGETS.map(
            (item) => `<button class="chip ${prefs.budget === item.value ? "active" : ""}" data-value="${item.value}">${item.label}</button>`
          ).join("")}
        </div>
      </div>
      <div class="field">
        <label>同行人数</label>
        <div class="choice-row" data-field="people">
          ${PEOPLE.map(
            (item) => `<button class="chip ${prefs.people === item.value ? "active" : ""}" data-value="${item.value}">${item.label}</button>`
          ).join("")}
        </div>
      </div>
      <div class="field">
        <label>兴趣（可多选）</label>
        <div class="choice-row" data-field="interests">
          ${CATEGORIES.map(
            (item) => `<button class="chip ${prefs.interests.includes(item) ? "active" : ""}" data-value="${item}">${item}</button>`
          ).join("")}
        </div>
      </div>
      <div class="toggle">
        <div>
          <strong>天气敏感</strong>
          <div class="lede" style="margin:4px 0 0">下雨或降水偏高时，优先室内，避免把徒步硬塞给你。</div>
        </div>
        <button class="chip ${prefs.weatherSensitive ? "active" : ""}" data-toggle-weather>
          ${prefs.weatherSensitive ? "已开启" : "已关闭"}
        </button>
      </div>
      <div class="row-actions">
        <button class="primary-btn" data-save-plan>查看本周推荐</button>
      </div>
    </section>
    `
  );

  app.querySelectorAll("[data-field] .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.parentElement.dataset.field;
      const next = getPrefs();
      if (field === "interests") {
        const value = btn.dataset.value;
        next.interests = next.interests.includes(value)
          ? next.interests.filter((item) => item !== value)
          : next.interests.concat(value);
        if (next.interests.length === 0) next.interests = [value];
      } else if (field === "budget" || field === "people") {
        next[field] = Number(btn.dataset.value);
      } else {
        next[field] = btn.dataset.value;
        delete weatherMemory[next.city];
      }
      savePrefs(next);
      renderPlan();
      if (field === "city") refreshWeatherThenRerender();
    });
  });

  app.querySelector("[data-toggle-weather]").addEventListener("click", () => {
    const next = getPrefs();
    next.weatherSensitive = !next.weatherSensitive;
    savePrefs(next);
    renderPlan();
  });
  app.querySelector("[data-save-plan]").addEventListener("click", () => go("#/results"));
}

function cardHtml(item) {
  return `
    <article class="card" data-open="${item.id}">
      <div class="meta">
        <span class="tag">${item.category}</span>
        <span>${item.time}</span>
        <span>${item.vibe}</span>
        <span>${item.indoor ? "室内" : "户外"}</span>
      </div>
      <h3>${esc(item.title)}</h3>
      <p class="lede">${esc(item.desc)}</p>
      <div class="meta">
        <span class="price">${formatCost(item.cost)}</span>
        <span>${item.duration}</span>
        <span>${peopleLabel(item.minPeople, item.maxPeople)}</span>
      </div>
    </article>
  `;
}

function renderResults() {
  const prefs = getPrefs();
  const rec = recommend(prefs);
  const stops = routeStops(rec.list);
  const day = rec.weather;
  app.innerHTML = shell(
    "results",
    `
    ${weatherBar(prefs, `<button class="ghost-btn" data-go="#/plan">改偏好</button>`)}
    ${
      rec.list.length
        ? `<section class="panel">
      <span class="kicker">${esc(prefs.city)} · ${esc(prefs.weekendDay)} · ${rec.list.length} 条</span>
      <h2>按你的条件筛出的周末方案</h2>
      <p class="lede">${
        !day.outdoorOk && prefs.weatherSensitive
          ? "这天偏湿，已经把户外往后放，并准备了室内备选。"
          : rec.relaxed
            ? "完全匹配的活动不够 6 条，已自动补入同城相近选项。"
            : "这些活动落在你的城市、预算、人数和天气偏好里。"
      }</p>
    </section>
    ${routeSection(stops)}
    ${rainSection(prefs, rec)}
    <section class="cards">
      ${rec.list.map(cardHtml).join("")}
    </section>`
        : emptyState("这组条件筛空了", "放宽预算、换一天，或暂时关掉天气敏感，就能重新看到活动。", "改偏好", "#/plan")
    }
    `
  );
}

function renderDetail(id) {
  const item = byId(id);
  if (!item) {
    app.innerHTML = shell(
      "results",
      `<section class="empty"><h2>没有找到这个活动</h2><p>回到推荐页再选一次。</p><button class="primary-btn" data-go="#/results">返回推荐</button></section>`
    );
    return;
  }
  const prefs = { ...getPrefs(), city: item.city };
  const weather = dayWeather(prefs);
  const checked = getCheckins().some((row) => row.activityId === item.id);
  const indoorAlts = indoorBackups(prefs, [item.id]).slice(0, 2);
  app.innerHTML = shell(
    "results",
    `
    <section class="panel">
      <span class="kicker">${esc(item.city)} · ${item.category}</span>
      <h2>${esc(item.title)}</h2>
      <p class="lede">${esc(item.desc)}</p>
      ${weatherBar(prefs)}
      <div class="detail-grid">
        <div><span>费用</span><b>${formatCost(item.cost)}</b></div>
        <div><span>时长</span><b>${item.duration}</b></div>
        <div><span>适合人数</span><b>${peopleLabel(item.minPeople, item.maxPeople)}</b></div>
        <div><span>集合点</span><b>${esc(item.meetup)}</b></div>
      </div>
      ${mapBlock(item.lat, item.lon, item.meetup)}
      <p class="lede">建议到场 ${item.time}。${item.indoor ? "室内为主" : "户外为主"} · ${
        item.indoor || weather.outdoorOk ? "适合出发" : "这天偏湿，建议改走室内备选或改期"
      }</p>
      ${
        !item.indoor && !weather.outdoorOk
          ? `<div class="lede">雨天备选：${
              indoorAlts.length
                ? indoorAlts.map((alt) => esc(alt.title)).join("、")
                : "回推荐页看室内线"
            }</div>`
          : ""
      }
      <div class="row-actions">
        <button class="primary-btn" data-team-from="${item.id}">组队出发</button>
        <button class="secondary-btn" data-checkin="${item.id}">${checked ? "已打卡" : "去过，打卡"}</button>
        <button class="ghost-btn" data-share-from="${item.id}">生成攻略</button>
      </div>
    </section>
    `
  );
}

function renderTeam() {
  const teams = getTeams();
  const prefs = getPrefs();
  const nickname = getNickname();
  const rec = recommend(prefs).list[0];
  app.innerHTML = shell(
    "team",
    `
    <section class="panel">
      <span class="kicker">组队出发</span>
      <h2>把周末从“我再看看”变成“我们走”</h2>
      <p class="lede">小队保存在这台设备${getSession() ? "，并记在你的账号名下" : ""}。把 4 位队码发给同学即可演示加入。</p>
      <div class="field">
        <label>你的称呼</label>
        <input class="text-input" id="nickname" value="${esc(nickname)}" placeholder="例如：阿年">
      </div>
      <div class="field">
        <label>小队名称</label>
        <input class="text-input" id="team-name" placeholder="例如：周六西岸小分队" value="${esc(prefs.city)}周末小队">
      </div>
      <div class="field">
        <label>关联活动</label>
        <select class="text-input" id="team-activity">
          ${GUIDE_DATA.activities
            .filter((item) => item.city === prefs.city)
            .map((item) => `<option value="${item.id}" ${rec && rec.id === item.id ? "selected" : ""}>${esc(item.title)}</option>`)
            .join("")}
        </select>
      </div>
      <div class="field">
        <label>一句话约定</label>
        <input class="text-input" id="team-note" placeholder="例如：下午 1 点门口见，迟到的请咖啡">
      </div>
      <div class="row-actions">
        <button class="primary-btn" id="create-team">创建小队</button>
      </div>
    </section>
    <section class="panel">
      <h3>加入已有小队</h3>
      <div class="field">
        <label>4 位队码</label>
        <input class="text-input" id="join-code" maxlength="4" placeholder="例如：K7P2">
      </div>
      <button class="secondary-btn" id="join-team">加入</button>
    </section>
    <section class="panel">
      <h3>我的小队</h3>
      ${
        teams.length
          ? teams
              .map((team) => {
                const act = byId(team.activityId);
                return `<div class="list-item">
                  <div>
                    <b>${esc(team.name)}</b>
                    <div class="lede">队码 ${esc(team.code)} · ${act ? esc(act.title) : "未指定活动"} · ${esc(team.members.join("、"))}</div>
                    <div class="lede">${esc(team.note || "还没有约定。")}</div>
                  </div>
                  <button class="ghost-btn" data-copy="${esc(team.code)}">复制队码</button>
                </div>`;
              })
              .join("")
          : emptyState(
              "还没有小队",
              "先去推荐里挑一个活动，点「组队出发」。队码只存在这台浏览器里，用来演示组队，不是把同学连到服务器。",
              "去看推荐",
              "#/results"
            )
      }
    </section>
    `
  );

  app.querySelector("#create-team").addEventListener("click", () => {
    const name = app.querySelector("#team-name").value.trim() || `${prefs.city}周末小队`;
    const nick = app.querySelector("#nickname").value.trim() || "匿名旅人";
    saveNickname(nick);
    const teamsNow = getTeams();
    const code = Math.random().toString(36).slice(2, 6).toUpperCase();
    teamsNow.unshift({
      id: String(Date.now()),
      code,
      name,
      activityId: app.querySelector("#team-activity").value,
      note: app.querySelector("#team-note").value.trim(),
      members: [nick],
      createdAt: new Date().toISOString()
    });
    saveTeams(teamsNow);
    toast("小队已创建");
    renderTeam();
  });

  app.querySelector("#join-team").addEventListener("click", () => {
    const code = app.querySelector("#join-code").value.trim().toUpperCase();
    const nick = app.querySelector("#nickname").value.trim() || "新加入的人";
    saveNickname(nick);
    const teamsNow = getTeams();
    const target = teamsNow.find((team) => team.code === code);
    if (!target) {
      toast("没有找到这个队码");
      return;
    }
    if (!target.members.includes(nick)) target.members.push(nick);
    saveTeams(teamsNow);
    toast("已加入小队");
    renderTeam();
  });
}

function renderCheckins() {
  const checkins = getCheckins();
  const last = checkins[0] && byId(checkins[0].activityId);
  app.innerHTML = shell(
    "account",
    `
    <section class="panel">
      <span class="kicker">打卡记录</span>
      <h2>去过的周末，留在这本小册子里</h2>
      <p class="lede">${getSession() ? "打卡记在当前账号下。" : "现在是游客模式，登录后新的打卡会记到账号里。"}</p>
    </section>
    ${
      last
        ? `<section class="panel"><h3>最近一次足迹</h3><p class="lede">${esc(last.title)} · ${esc(last.meetup)}</p>${mapBlock(last.lat, last.lon, last.meetup)}</section>`
        : ""
    }
    <section class="panel">
      ${
        checkins.length
          ? checkins
              .map((row) => {
                const item = byId(row.activityId);
                return `<div class="list-item">
                  <div>
                    <b>${esc(row.title)}</b>
                    <div class="lede">${esc(row.city)} · ${new Date(row.at).toLocaleString("zh-CN")} · ${esc(row.note || "留下了足迹")}</div>
                  </div>
                  ${item ? `<button class="ghost-btn" data-open="${item.id}">再看一眼</button>` : ""}
                </div>`;
              })
              .join("")
          : emptyState(
              "还没有打卡",
              "去过一次就在详情页留下足迹。雨天改去室内展，也算一次有效周末。空着并不代表产品坏了，只是你还没出发。",
              "去看推荐",
              "#/results"
            )
      }
    </section>
    `
  );
}

function importGuestIfEmpty(username) {
  const hasPrefs = load(`${STORAGE.prefs}:${username}`, null);
  if (!hasPrefs) save(`${STORAGE.prefs}:${username}`, load(STORAGE.prefs, defaultPrefs()));
  if (!load(`${STORAGE.teams}:${username}`, null)) save(`${STORAGE.teams}:${username}`, load(STORAGE.teams, []));
  if (!load(`${STORAGE.checkins}:${username}`, null)) save(`${STORAGE.checkins}:${username}`, load(STORAGE.checkins, []));
}

function renderAccount() {
  const session = getSession();
  const prefs = getPrefs();
  const checkins = getCheckins();
  const teams = getTeams();
  if (session) {
    app.innerHTML = shell(
      "account",
      `
      <section class="panel">
        <span class="kicker">我的账号</span>
        <h2>你好，${esc(session.nickname || session.username)}</h2>
        <p class="lede">账号存在这台设备的浏览器里，换手机需要重新登记。这是产品壳，不是云端账号。</p>
        <div class="stat-row">
          <div class="stat"><b>${esc(prefs.city)}</b><span>常驻城市</span></div>
          <div class="stat"><b>${teams.length}</b><span>小队</span></div>
          <div class="stat"><b>${checkins.length}</b><span>打卡</span></div>
        </div>
        <div class="field" style="margin-top:16px">
          <label>显示名称</label>
          <input class="text-input" id="profile-name" value="${esc(session.nickname || session.username)}">
        </div>
        <div class="row-actions">
          <button class="primary-btn" id="save-profile">保存名称</button>
          <button class="ghost-btn" data-go="#/checkins">查看打卡</button>
          <button class="ghost-btn" id="logout">退出登录</button>
        </div>
      </section>
      `
    );
    app.querySelector("#save-profile").addEventListener("click", () => {
      const name = app.querySelector("#profile-name").value.trim();
      if (!name) return toast("名称不能为空");
      saveNickname(name);
      toast("已保存");
      renderAccount();
    });
    app.querySelector("#logout").addEventListener("click", () => {
      localStorage.removeItem(STORAGE.session);
      toast("已退出");
      renderAccount();
    });
    return;
  }

  app.innerHTML = shell(
    "account",
    `
    <section class="panel">
      <span class="kicker">登录 / 登记</span>
      <h2>给这台设备上的足迹起个名字</h2>
      <p class="lede">不接服务器。登记后，偏好、小队和打卡会记在你的用户名下；不登录也能继续用。</p>
      <div class="field">
        <label>用户名</label>
        <input class="text-input" id="username" placeholder="2–12 个字，例如 xiaoyu">
      </div>
      <div class="field">
        <label>口令</label>
        <input class="text-input" id="password" type="password" placeholder="至少 4 位，仅存在本机">
      </div>
      <div class="row-actions">
        <button class="primary-btn" id="login">登录</button>
        <button class="secondary-btn" id="register">登记新账号</button>
        <button class="ghost-btn" data-go="#/checkins">先看打卡</button>
      </div>
    </section>
    `
  );

  const readForm = () => ({
    username: app.querySelector("#username").value.trim(),
    password: app.querySelector("#password").value
  });

  app.querySelector("#register").addEventListener("click", () => {
    const { username, password } = readForm();
    if (username.length < 2 || username.length > 12 || /\s/.test(username)) {
      toast("用户名用 2–12 个字，不要空格");
      return;
    }
    if (password.length < 4) {
      toast("口令至少 4 位");
      return;
    }
    const accounts = load(STORAGE.accounts, []);
    if (accounts.some((item) => item.username === username)) {
      toast("这个用户名已经登记过");
      return;
    }
    accounts.push({
      username,
      pin: hashPin(password),
      nickname: username,
      createdAt: new Date().toISOString()
    });
    save(STORAGE.accounts, accounts);
    importGuestIfEmpty(username);
    save(STORAGE.session, { username, nickname: username });
    toast("登记成功");
    renderAccount();
  });

  app.querySelector("#login").addEventListener("click", () => {
    const { username, password } = readForm();
    const accounts = load(STORAGE.accounts, []);
    const found = accounts.find((item) => item.username === username && item.pin === hashPin(password));
    if (!found) {
      toast("用户名或口令不对");
      return;
    }
    save(STORAGE.session, { username: found.username, nickname: found.nickname || found.username });
    toast("已登录");
    renderAccount();
  });
}

function shareText(activityId) {
  const prefs = getPrefs();
  const rec = recommend(prefs);
  const bundle = getWeather(prefs.city);
  const focus = byId(activityId) || rec.list[0];
  const teams = getTeams();
  const stops = routeStops(rec.list);
  const rain = indoorBackups(prefs, rec.list.map((item) => item.id));
  const mapLine =
    stops.length >= 2 ? `路线导航：${amapRoute(stops)}` : focus && focus.lat ? `导航：${amapLink(focus.lat, focus.lon, focus.meetup)}` : "";
  return [
    `【周末探城】${prefs.city} · ${prefs.weekendDay}`,
    `周六：${bundle.saturday.text}`,
    `周日：${bundle.sunday.text}`,
    rec.weather.tip,
    `人数：${prefs.people} 人 · 预算：${prefs.budget === 9999 ? "不限" : prefs.budget + " 元内"} · 兴趣：${prefs.interests.join("、")}`,
    focus
      ? `主线：${focus.title}（${formatCost(focus.cost)} / ${focus.duration}）\n集合：${focus.meetup}`
      : "还没有选出主线活动。",
    stops.length ? `路线：${stops.map((item, index) => `${index + 1}.${item.title}`).join(" → ")}` : "",
    mapLine,
    rain.length ? `雨天备选：${rain.map((item) => item.title).join("、")}` : "",
    "备选：",
    ...rec.list.slice(0, 3).map((item, index) => `${index + 1}. ${item.title} · ${formatCost(item.cost)}`),
    teams[0] ? `小队：${teams[0].name}（队码 ${teams[0].code}）` : "还没有组队，打开「组队」页一分钟就能建一个。",
    "来源：周末探城，天气来自 Open-Meteo。"
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function renderShare(activityId) {
  const text = shareText(activityId);
  app.innerHTML = shell(
    "home",
    `
    <section class="panel">
      <span class="kicker">攻略分享</span>
      <h2>复制这段话，丢进宿舍群就够了</h2>
      <p class="lede">文案会带上实时天气、主线、导航链接和备选。</p>
      <textarea class="share-box" id="share-text">${esc(text)}</textarea>
      <div class="row-actions">
        <button class="primary-btn" id="copy-share">复制攻略</button>
        <button class="ghost-btn" data-go="#/results">改推荐再生成</button>
      </div>
    </section>
    `
  );
  app.querySelector("#copy-share").addEventListener("click", async () => {
    const value = app.querySelector("#share-text").value;
    try {
      await navigator.clipboard.writeText(value);
      toast("攻略已复制");
    } catch (err) {
      app.querySelector("#share-text").select();
      toast("请手动复制");
    }
  });
}

function checkin(id) {
  const item = byId(id);
  if (!item) return;
  const checkins = getCheckins();
  if (checkins.some((row) => row.activityId === id)) {
    toast("已经打过卡了");
    return;
  }
  checkins.unshift({
    activityId: id,
    city: item.city,
    title: item.title,
    note: `${item.category} · ${item.vibe}`,
    at: new Date().toISOString()
  });
  saveCheckins(checkins);
  toast(getSession() ? "已记到你的账号" : "已记下这次足迹");
}

function createTeamFrom(id) {
  const item = byId(id);
  const nick = getNickname() || "发起人";
  const teams = getTeams();
  const code = Math.random().toString(36).slice(2, 6).toUpperCase();
  teams.unshift({
    id: String(Date.now()),
    code,
    name: item ? `${item.title}小队` : "周末小队",
    activityId: id,
    note: "详情页一键组队，到了集合点再细说。",
    members: [nick],
    createdAt: new Date().toISOString()
  });
  saveTeams(teams);
  go("#/team");
}

function bindGlobal() {
  app.addEventListener("click", (event) => {
    const goBtn = event.target.closest("[data-go]");
    if (goBtn) {
      go(goBtn.dataset.go);
      return;
    }
    const dayBtn = event.target.closest("[data-weekend-day]");
    if (dayBtn) {
      const next = getPrefs();
      next.weekendDay = dayBtn.dataset.weekendDay;
      savePrefs(next);
      renderWithoutWeatherLoop();
      return;
    }
    const openBtn = event.target.closest("[data-open]");
    if (openBtn) {
      go(`#/activity/${openBtn.dataset.open}`);
      return;
    }
    const checkBtn = event.target.closest("[data-checkin]");
    if (checkBtn) {
      checkin(checkBtn.dataset.checkin);
      renderDetail(checkBtn.dataset.checkin);
      return;
    }
    const teamBtn = event.target.closest("[data-team-from]");
    if (teamBtn) {
      createTeamFrom(teamBtn.dataset.teamFrom);
      return;
    }
    const shareBtn = event.target.closest("[data-share-from]");
    if (shareBtn) {
      go(`#/share/${shareBtn.dataset.shareFrom}`);
      return;
    }
    const copyBtn = event.target.closest("[data-copy]");
    if (copyBtn) {
      navigator.clipboard.writeText(copyBtn.dataset.copy).then(
        () => toast("队码已复制"),
        () => toast("复制失败，请手抄队码")
      );
    }
  });
}

function render() {
  const { page, id } = parseHash();
  if (page === "plan") renderPlan();
  else if (page === "results") renderResults();
  else if (page === "activity") renderDetail(id);
  else if (page === "team") renderTeam();
  else if (page === "checkins") renderCheckins();
  else if (page === "share") renderShare(id);
  else if (page === "account") renderAccount();
  else renderHome();
  refreshWeatherThenRerender();
}

function refreshWeatherThenRerender() {
  const city = getPrefs().city;
  const before = JSON.stringify(getWeather(city));
  ensureWeather(city).then(() => {
    const after = JSON.stringify(getWeather(city));
    if (after !== before) renderWithoutWeatherLoop();
  });
}

function renderWithoutWeatherLoop() {
  const { page, id } = parseHash();
  if (page === "plan") return renderPlan();
  if (page === "results") return renderResults();
  if (page === "activity") return renderDetail(id);
  if (page === "team") return renderTeam();
  if (page === "checkins") return renderCheckins();
  if (page === "share") return renderShare(id);
  if (page === "account") return renderAccount();
  return renderHome();
}

restoreWeatherCache();
bindGlobal();
window.addEventListener("hashchange", render);
render();
