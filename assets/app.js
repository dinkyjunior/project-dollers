(() => {
  "use strict";
  const pages = [...document.querySelectorAll(".page")];
  const data = window.PD_DATA;
  const state = {
    week: "4",
    conference: "AFC",
    nflTab: "ladder",
    teamTab: "roster",
    filter: "ALL",
  };
  const icon = (name) =>
    `<svg class="icon" aria-hidden="true"><use href="assets/icons.svg#${name}"></use></svg>`;
  function openPage(id, writeHash = true) {
    if (!pages.some((p) => p.dataset.page === id)) id = "home";
    pages.forEach((page) => {
      const active = page.dataset.page === id;
      page.classList.toggle("active", active);
      page.hidden = !active;
      if (active) page.querySelector(".page-scroll").scrollTop = 0;
    });
    document.querySelectorAll("[data-nav]").forEach((button) => {
      if (button.dataset.nav === (id === "steelers" ? "nfl" : id))
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (writeHash && location.hash !== `#${id}`)
      history.pushState(null, "", `#${id}`);
  }
  function selectTab(type, value) {
    const tabs = [...document.querySelectorAll(`[data-${type}-tab]`)];
    tabs.forEach((tab) => {
      const active = tab.dataset[`${type}Tab`] === value;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden =
        !active;
    });
    state[`${type}Tab`] = value;
  }
  document.querySelectorAll("[role=tablist]").forEach((list) =>
    list.addEventListener("keydown", (event) => {
      const tabs = [...list.querySelectorAll("[role=tab]")];
      const index = tabs.indexOf(document.activeElement);
      if (
        index < 0 ||
        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
      )
        return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      tabs[next].focus();
      tabs[next].click();
    }),
  );
  function leaderboard(snapshot) {
    return ["QB", "RB"]
      .map(
        (position) =>
          `<section class="leader-panel"><h2>TOP 5 ${position}s <span>(WEEK ${snapshot.throughWeek})</span></h2><div class="leader-columns"><span>PLAYER</span><span>YDS</span><span>TD</span></div>${snapshot.leaders[position].map((player, index) => `<div class="leader-row"><b>${index + 1}</b><span title="${player.name}">${player.short}</span><span>${player.yards}</span><span>${player.td}</span></div>`).join("")}</section>`,
      )
      .join("");
  }
  function matchup(snapshot) {
    if (!snapshot.fixture)
      return `<div class="bye-card"><img src="assets/logos/pit.png" alt="Steelers"><div><strong>Steelers · Bye week</strong><p>Week ${state.week} · 2025</p></div></div>`;
    const game = snapshot.fixture;
    const opponent = game.away_team === "PIT" ? game.home_team : game.away_team;
    const date = new Date(`${game.gameday}T12:00:00Z`).toLocaleDateString(
      "en-US",
      { timeZone: "UTC", month: "short", day: "numeric" },
    );
    const [hours, minutes] = game.gametime.split(":").map(Number);
    const time = `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"} ET`;
    return `<button class="game-card" data-open="steelers" aria-label="Explore Steelers roster, ${data.teamNames.PIT} versus ${data.teamNames[opponent]}"><span class="game-team"><img src="assets/logos/pit.png" alt=""><strong>Steelers</strong><small>PIT</small></span><span class="game-center"><span class="fixture-week">WEEK ${state.week} · 2025</span><strong>${game.weekday.slice(0, 3)}, ${date}</strong><span>${time}</span><small>Historical fixture</small></span><span class="game-team"><img src="assets/logos/${opponent.toLowerCase()}.png" alt=""><strong>${data.teamNames[opponent]}</strong><small>${opponent}</small></span></button>`;
  }
  function renderDashboard() {
    const snapshot = data.weeks[state.week];
    document.getElementById("week-select").value = state.week;
    document
      .querySelectorAll("[data-week]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.week === state.week),
        ),
      );
    document
      .querySelectorAll("[data-conference]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.conference === state.conference),
        ),
      );
    document.getElementById("table-caption").textContent =
      `SELECTED ${state.conference} TEAMS`;
    document.querySelector(".through-week").textContent =
      `THROUGH WEEK ${snapshot.throughWeek}`;
    document.getElementById("standings-rows").innerHTML = snapshot.conferences[
      state.conference
    ]
      .map(
        (team) =>
          `<div class="stand-row${team.id === "pit" ? " steelers-row" : ""}" role="row"><span role="cell">—</span><span class="table-team" role="cell">${team.id === "pit" ? `<button class="team-link" data-open="steelers" aria-label="Explore Pittsburgh Steelers roster">` : ""}<img src="assets/logos/${team.id}.png" alt=""><span>${team.name}</span>${team.id === "pit" ? "</button>" : ""}</span><span role="cell">${team.w}</span><span role="cell">${team.l}</span><span role="cell">${team.pct}</span><span class="streak ${team.streak[0] === "W" ? "win" : "loss"}" role="cell">${team.streak}</span></div>`,
      )
      .join("");
    for (const id of ["ladder-leaders", "players-leaders"])
      document.getElementById(id).innerHTML = leaderboard(snapshot);
    document.getElementById("featured-matchup").innerHTML = matchup(snapshot);
    // The team panel uses the same fixture, without a link back into the same page.
    document.getElementById("team-matchup").innerHTML = matchup(snapshot)
      .replace(/<button class="game-card"[^>]*>/, '<div class="game-card">')
      .replace("</button>", "</div>");
    document.getElementById("recap-title").textContent =
      `Week ${snapshot.throughWeek} in numbers`;
    document.getElementById("recap-content").innerHTML = ["QB", "RB"]
      .map((position) => {
        const player = snapshot.leaders[position][0];
        return `<div class="recap-stat"><span>${position === "QB" ? "PASSING" : "RUSHING"} LEADER</span><strong>${player.name}</strong><b>${player.yards}<small> YDS</small></b><p>${player.td} touchdowns · Week ${snapshot.throughWeek}</p></div>`;
      })
      .join("");
  }
  function filterRoster(value) {
    state.filter = value;
    let count = 0;
    document
      .querySelectorAll("[data-filter]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.filter === value),
        ),
      );
    document.querySelectorAll(".player-card").forEach((card) => {
      card.hidden = value !== "ALL" && card.dataset.position !== value;
      if (!card.hidden) count++;
    });
    document.getElementById("empty-roster").hidden = count > 0;
  }
  function renderSchedule() {
    document.getElementById("schedule-list").innerHTML = Object.entries(
      data.weeks,
    )
      .map(([week, snapshot]) => {
        const fixture = snapshot.fixture;
        const opponent =
          fixture &&
          (fixture.away_team === "PIT" ? fixture.home_team : fixture.away_team);
        return `<div class="schedule-row"><span class="schedule-week">WK ${week}</span>${opponent ? `<img src="assets/logos/${opponent.toLowerCase()}.png" alt=""><div><strong>${data.teamNames[opponent]}</strong><span>${fixture.gameday}</span></div>` : "<div><strong>Bye week</strong><span>No fixture</span></div>"}</div>`;
      })
      .join("");
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.open) openPage(button.dataset.open);
    if (button.dataset.nflTab) selectTab("nfl", button.dataset.nflTab);
    if (button.dataset.teamTab) selectTab("team", button.dataset.teamTab);
    if (button.dataset.conference) {
      state.conference = button.dataset.conference;
      renderDashboard();
    }
    if (button.dataset.week) {
      state.week = button.dataset.week;
      renderDashboard();
    }
    if (button.dataset.filter) filterRoster(button.dataset.filter);
    if (button.dataset.shortcut) {
      openPage("nfl");
      selectTab(
        "nfl",
        button.dataset.shortcut === "insights" ? "players" : "ladder",
      );
      if (button.dataset.shortcut === "matchups")
        document
          .querySelector(".matchup-section")
          .scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (button.hasAttribute("data-more"))
      document.getElementById("about-dialog").showModal();
  });
  document.getElementById("week-select").addEventListener("change", (event) => {
    state.week = event.target.value;
    renderDashboard();
  });
  window.addEventListener("popstate", () =>
    openPage(location.hash.slice(1), false),
  );
  window.addEventListener("hashchange", () =>
    openPage(location.hash.slice(1), false),
  );
  renderDashboard();
  renderSchedule();
  openPage(location.hash.slice(1), false);
})();
