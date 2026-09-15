const STORAGE = {
  prefs: "weekend-guide-prefs",
  teams: "weekend-guide-teams",
  checkins: "weekend-guide-checkins",
  nickname: "weekend-guide-nickname"
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

function defaultPrefs() {
  return {
    city: "上海",
    budget: 150,
    people: 2,
    interests: ["展览", "市集"],
    weatherSensitive: true
  };
}

function getPrefs() {
  return { ...defaultPrefs(), ...load(STORAGE.prefs, {}) };
}

function getNickname() {
  return load(STORAGE.nickname, "") || "";
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
  const page = parts[0] || "home";
  return { page, id: parts[1] || "" };
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
  const weather = GUIDE_DATA.weather[prefs.city];
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

  return {
    weather,
    relaxed,
    list: picked.map((row) => row.item)
  };
}

function nav(active) {
  const items = [
    ["#/", "首页", "home"],
    ["#/plan", "偏好", "plan"],
    ["#/results", "推荐", "results"],
    ["#/team", "组队", "team"],
    ["#/checkins", "打卡", "checkins"]
  ];
  return `<nav class="nav">${items
    .map(
      ([href, label, key]) =>
        `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`
    )
    .join("")}</nav>`;
}

function shell(active, content) {
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
        <button class="ghost-btn" data-go="#/share">生成攻略</button>
      </header>
      ${content}
    </div>
    ${nav(active)}
  `;
}

function renderHome() {
  const prefs = getPrefs();
  const weather = GUIDE_DATA.weather[prefs.city];
  const checkins = load(STORAGE.checkins, []);
  const teams = load(STORAGE.teams, []);
  app.innerHTML = shell(
    "home",
    `
    <section class="hero">
      <span class="kicker">WEEKEND CITY GUIDE</span>
      <h1>周末去哪玩，先把天气和预算说清楚。</h1>
      <p class="lede">展览、市集、演出、短途徒步的信息太散。这里按你的城市、预算、人数和天气敏感度，给出这一次就能出发的本地方案，并支持组队、打卡和分享攻略。</p>
      <div class="hero-actions">
        <button class="primary-btn" data-go="#/plan">开始规划</button>
        <button class="secondary-btn" data-go="#/results">先看推荐</button>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${prefs.city}</b><span>当前城市</span></div>
        <div class="stat"><b>${teams.length}</b><span>本地小队</span></div>
        <div class="stat"><b>${checkins.length}</b><span>已打卡</span></div>
      </div>
    </section>
    <section class="weather-bar" style="margin-top:16px">
      <div>
        <strong>${weather.text}</strong>
        <div class="lede" style="margin:6px 0 0">${weather.tip}</div>
      </div>
    </section>
    `
  );
}

function renderPlan() {
  const prefs = getPrefs();
  app.innerHTML = shell(
    "plan",
    `
    <section class="panel">
      <span class="kicker">STEP 01</span>
      <h2>告诉我这周末怎么玩</h2>
      <p class="lede">这些选择会直接筛推荐，不会被拿去登录或上传。</p>
      <div class="field">
        <label>城市</label>
        <div class="choice-row" data-field="city">
          ${GUIDE_DATA.cities
            .map(
              (city) =>
                `<button class="chip ${prefs.city === city ? "active" : ""}" data-value="${city}">${city}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="field">
        <label>预算</label>
        <div class="choice-row" data-field="budget">
          ${BUDGETS.map(
            (item) =>
              `<button class="chip ${prefs.budget === item.value ? "active" : ""}" data-value="${item.value}">${item.label}</button>`
          ).join("")}
        </div>
      </div>
      <div class="field">
        <label>同行人数</label>
        <div class="choice-row" data-field="people">
          ${PEOPLE.map(
            (item) =>
              `<button class="chip ${prefs.people === item.value ? "active" : ""}" data-value="${item.value}">${item.label}</button>`
          ).join("")}
        </div>
      </div>
      <div class="field">
        <label>兴趣（可多选）</label>
        <div class="choice-row" data-field="interests">
          ${CATEGORIES.map(
            (item) =>
              `<button class="chip ${prefs.interests.includes(item) ? "active" : ""}" data-value="${item}">${item}</button>`
          ).join("")}
        </div>
      </div>
      <div class="toggle">
        <div>
          <strong>天气敏感</strong>
          <div class="lede" style="margin:4px 0 0">下雨时优先室内，避免把徒步硬塞给你。</div>
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
      }
      save(STORAGE.prefs, next);
      renderPlan();
    });
  });

  app.querySelector("[data-toggle-weather]").addEventListener("click", () => {
    const next = getPrefs();
    next.weatherSensitive = !next.weatherSensitive;
    save(STORAGE.prefs, next);
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
      </div>
      <h3>${item.title}</h3>
      <p class="lede">${item.desc}</p>
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
  app.innerHTML = shell(
    "results",
    `
    <section class="weather-bar">
      <div>
        <strong>${rec.weather.text}</strong>
        <div>${rec.weather.tip}</div>
      </div>
      <button class="ghost-btn" data-go="#/plan">改偏好</button>
    </section>
    <section class="panel">
      <span class="kicker">${prefs.city} · ${rec.list.length} 条</span>
      <h2>按你的条件筛出的周末方案</h2>
      <p class="lede">${
        rec.relaxed
          ? "完全匹配的活动不够 6 条，已自动补入同城相近选项，避免你对着空列表发呆。"
          : "这些活动都落在你的城市、预算、人数和天气偏好里。"
      }</p>
    </section>
    <section class="cards">
      ${rec.list.map(cardHtml).join("")}
    </section>
    `
  );
}

function renderDetail(id) {
  const item = byId(id);
  if (!item) {
    app.innerHTML = shell(
      "results",
      `<section class="empty"><h2>没有找到这个活动</h2><p>可能是链接不完整。回到推荐页再选一次。</p><button class="primary-btn" data-go="#/results">返回推荐</button></section>`
    );
    return;
  }
  const weather = GUIDE_DATA.weather[item.city];
  const checked = load(STORAGE.checkins, []).some((row) => row.activityId === item.id);
  app.innerHTML = shell(
    "results",
    `
    <section class="panel">
      <span class="kicker">${item.city} · ${item.category}</span>
      <h2>${item.title}</h2>
      <p class="lede">${item.desc}</p>
      <div class="weather-bar" style="margin:16px 0 0">
        <strong>${weather.text}</strong>
        <span>${item.indoor ? "室内为主" : "户外为主"} · ${item.indoor || weather.outdoorOk ? "适合出发" : "建议改期或备伞"}</span>
      </div>
      <div class="detail-grid">
        <div><span>费用</span><b>${formatCost(item.cost)}</b></div>
        <div><span>时长</span><b>${item.duration}</b></div>
        <div><span>适合人数</span><b>${peopleLabel(item.minPeople, item.maxPeople)}</b></div>
        <div><span>集合点</span><b>${item.meetup}</b></div>
      </div>
      <p class="lede">建议到场时间 ${item.time}。当前偏好不会被上传，组队和打卡都只存在这台设备上。</p>
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
  const teams = load(STORAGE.teams, []);
  const prefs = getPrefs();
  const nickname = getNickname();
  const rec = recommend(prefs).list[0];
  app.innerHTML = shell(
    "team",
    `
    <section class="panel">
      <span class="kicker">组队出发</span>
      <h2>把周末从“我再看看”变成“我们走”</h2>
      <p class="lede">小队只保存在本地。把 4 位队码发给同学，他们在同一浏览器点加入即可演示。</p>
      <div class="field">
        <label>你的称呼</label>
        <input class="text-input" id="nickname" value="${nickname}" placeholder="例如：阿年">
      </div>
      <div class="field">
        <label>小队名称</label>
        <input class="text-input" id="team-name" placeholder="例如：周六西岸小分队" value="${prefs.city}周末小队">
      </div>
      <div class="field">
        <label>关联活动</label>
        <select class="text-input" id="team-activity">
          ${GUIDE_DATA.activities
            .filter((item) => item.city === prefs.city)
            .map((item) => `<option value="${item.id}" ${rec && rec.id === item.id ? "selected" : ""}>${item.title}</option>`)
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
                    <b>${team.name}</b>
                    <div class="lede">队码 ${team.code} · ${act ? act.title : "未指定活动"} · ${team.members.join("、")}</div>
                    <div class="lede">${team.note || "还没有约定。"}</div>
                  </div>
                  <button class="ghost-btn" data-copy="${team.code}">复制队码</button>
                </div>`;
              })
              .join("")
          : `<div class="empty">还没有小队。创建一个周末小队，把队码丢进群里就行。</div>`
      }
    </section>
    `
  );

  app.querySelector("#create-team").addEventListener("click", () => {
    const name = app.querySelector("#team-name").value.trim() || `${prefs.city}周末小队`;
    const nick = app.querySelector("#nickname").value.trim() || "匿名旅人";
    save(STORAGE.nickname, nick);
    const teamsNow = load(STORAGE.teams, []);
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
    save(STORAGE.teams, teamsNow);
    toast("小队已创建");
    renderTeam();
  });

  app.querySelector("#join-team").addEventListener("click", () => {
    const code = app.querySelector("#join-code").value.trim().toUpperCase();
    const nick = app.querySelector("#nickname").value.trim() || "新加入的人";
    save(STORAGE.nickname, nick);
    const teamsNow = load(STORAGE.teams, []);
    const target = teamsNow.find((team) => team.code === code);
    if (!target) {
      toast("没有找到这个队码");
      return;
    }
    if (!target.members.includes(nick)) target.members.push(nick);
    save(STORAGE.teams, teamsNow);
    toast("已加入小队");
    renderTeam();
  });
}

function renderCheckins() {
  const checkins = load(STORAGE.checkins, []);
  app.innerHTML = shell(
    "checkins",
    `
    <section class="panel">
      <span class="kicker">打卡记录</span>
      <h2>去过的周末，留在这本小册子里</h2>
      <p class="lede">打卡只存在这台手机/电脑。清空浏览器数据就会消失，适合先演示产品逻辑。</p>
    </section>
    <section class="panel">
      ${
        checkins.length
          ? checkins
              .map((row) => {
                const item = byId(row.activityId);
                return `<div class="list-item">
                  <div>
                    <b>${row.title}</b>
                    <div class="lede">${row.city} · ${new Date(row.at).toLocaleString("zh-CN")} · ${row.note || "留下了足迹"}</div>
                  </div>
                  ${item ? `<button class="ghost-btn" data-open="${item.id}">再看一眼</button>` : ""}
                </div>`;
              })
              .join("")
          : `<div class="empty">还没有打卡。去过一次活动，就可以在详情页留下足迹。</div>`
      }
    </section>
    `
  );
}

function shareText(activityId) {
  const prefs = getPrefs();
  const rec = recommend(prefs);
  const focus = byId(activityId) || rec.list[0];
  const teams = load(STORAGE.teams, []);
  const lines = [
    `【周末探城】${prefs.city}这一趟怎么走`,
    rec.weather.text,
    `人数：${prefs.people} 人 · 预算：${prefs.budget === 9999 ? "不限" : prefs.budget + " 元内"} · 兴趣：${prefs.interests.join("、")}`,
    "",
    focus
      ? `主线：${focus.title}（${formatCost(focus.cost)} / ${focus.duration}）\n集合：${focus.meetup}\n${focus.desc}`
      : "还没有选出主线活动。",
    "",
    "备选：",
    ...rec.list.slice(0, 3).map((item, index) => `${index + 1}. ${item.title} · ${formatCost(item.cost)}`),
    "",
    teams[0] ? `小队：${teams[0].name}（队码 ${teams[0].code}）` : "还没有组队，打开「组队」页一分钟就能建一个。",
    "",
    "来源：周末探城雏形，数据仅供演示。"
  ];
  return lines.join("\n");
}

function renderShare(activityId) {
  const text = shareText(activityId);
  app.innerHTML = shell(
    "home",
    `
    <section class="panel">
      <span class="kicker">攻略分享</span>
      <h2>复制这段话，丢进宿舍群就够了</h2>
      <p class="lede">文案会带上天气、预算、主线和备选。面试官即使不注册，也能看懂产品在解决什么。</p>
      <textarea class="share-box" id="share-text">${text}</textarea>
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
  const checkins = load(STORAGE.checkins, []);
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
  save(STORAGE.checkins, checkins);
  toast("已记下这次足迹");
}

function createTeamFrom(id) {
  const item = byId(id);
  const nick = getNickname() || "发起人";
  const teams = load(STORAGE.teams, []);
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
  save(STORAGE.teams, teams);
  go("#/team");
}

function bindGlobal() {
  app.addEventListener("click", (event) => {
    const goBtn = event.target.closest("[data-go]");
    if (goBtn) {
      go(goBtn.dataset.go);
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
  if (page === "plan") return renderPlan();
  if (page === "results") return renderResults();
  if (page === "activity") return renderDetail(id);
  if (page === "team") return renderTeam();
  if (page === "checkins") return renderCheckins();
  if (page === "share") return renderShare(id);
  return renderHome();
}

bindGlobal();
window.addEventListener("hashchange", render);
render();
