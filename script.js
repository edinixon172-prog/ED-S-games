
"use strict";

/* ==========================================================
   ULTIMATE FOOTBALL: PRO ARENA
   Browser football game — HTML Canvas + JavaScript
   ========================================================== */

(() => {
  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const menuScreen = $("menuScreen");
  const gameScreen = $("gameScreen");
  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d");

  const playBtn = $("playBtn");
  const howBtn = $("howBtn");
  const helpPanel = $("helpPanel");
  const pauseBtn = $("pauseBtn");
  const backBtn = $("backBtn");
  const resumeBtn = $("resumeBtn");
  const restartBtn = $("restartBtn");
  const quitBtn = $("quitBtn");
  const againBtn = $("againBtn");
  const resultMenuBtn = $("resultMenuBtn");
  const pauseOverlay = $("pauseOverlay");
  const resultOverlay = $("resultOverlay");
  const toast = $("toast");

  // ---------- CONSTANTS ----------
  const W = 960;
  const H = 540;

  const FIELD = {
    x: 34,
    y: 34,
    w: 892,
    h: 472
  };

  const GOAL = {
    width: 16,
    height: 112
  };

  const MATCH_LENGTH = 180;
  const MAX_CHARGE = 1.45;
  const BALL_RADIUS = 7;
  const PLAYER_RADIUS = 13;

  const COLORS = {
    grassA: "#327a43",
    grassB: "#286b39",
    line: "rgba(245,255,242,.83)",
    home: "#c5ff69",
    homeDark: "#4c9137",
    away: "#ff716e",
    awayDark: "#b84045",
    ball: "#f8f8ed"
  };

  // ---------- STATE ----------
  let mode = "quick";
  let running = false;
  let paused = false;
  let ended = false;
  let soundEnabled = true;

  let lastTime = 0;
  let elapsed = 0;
  let remaining = MATCH_LENGTH;
  let charge = 0;
  let charging = false;
  let toastTimer = 0;
  let kickCooldown = 0;
  let passCooldown = 0;
  let switchCooldown = 0;
  let possessionTimer = 0;

  let homeScore = 0;
  let awayScore = 0;
  let shots = 0;
  let goals = 0;
  let saves = 0;
  let totalHomePossession = 0;
  let totalAwayPossession = 0;

  let audioContext = null;
  let pointer = { x: W * 0.77, y: H * 0.5, inside: false };

  const keys = new Set();
  const particles = [];
  const floatingTexts = [];
  const trails = [];

  let homePlayers = [];
  let awayPlayers = [];
  let player;
  let ball;
  let keeperHome;
  let keeperAway;

  // ---------- HELPERS ----------
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function normalize(x, y) {
    const length = Math.hypot(x, y);
    if (length < 0.0001) return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function goalY() {
    return FIELD.y + FIELD.h / 2;
  }

  function clampPlayer(p) {
    p.x = clamp(p.x, FIELD.x + 18, FIELD.x + FIELD.w - 18);
    p.y = clamp(p.y, FIELD.y + 18, FIELD.y + FIELD.h - 18);
  }

  function clampBall(b) {
    b.y = clamp(b.y, FIELD.y + BALL_RADIUS, FIELD.y + FIELD.h - BALL_RADIUS);
  }

  function randomFieldY() {
    return rand(FIELD.y + 35, FIELD.y + FIELD.h - 35);
  }

  function showToast(message, duration = 1.1) {
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = duration;
  }

  function sound(frequency = 440, duration = 0.07, type = "sine", volume = 0.045) {
    if (!soundEnabled) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      audioContext ??= new AudioCtx();
      if (audioContext.state === "suspended") audioContext.resume();

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + duration
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      // Audio is optional; gameplay continues without it.
    }
  }

  function addFloatingText(x, y, text, color = "#ffffff") {
    floatingTexts.push({
      x, y, text, color,
      life: 1,
      maxLife: 1,
      vy: -32
    });
  }

  function burst(x, y, color, count = 14, speed = 110) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = rand(speed * 0.3, speed);

      particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: rand(0.25, 0.75),
        maxLife: 0.75,
        size: rand(2, 5),
        color
      });
    }
  }

  // ---------- ENTITIES ----------
  function makePlayer(x, y, team, role = "field", number = 1) {
    return {
      x, y,
      vx: 0,
      vy: 0,
      team,
      role,
      number,
      radius: role === "keeper" ? 15 : PLAYER_RADIUS,
      speed: role === "keeper" ? 155 : rand(180, 205),
      sprintSpeed: role === "keeper" ? 155 : rand(260, 290),
      direction: team === "home" ? 0 : Math.PI,
      stamina: 100,
      targetX: x,
      targetY: y,
      aiTimer: rand(0.1, 0.8),
      reaction: rand(0.12, 0.3),
      hasBall: false,
      slide: 0,
      tint: team === "home" ? COLORS.home : COLORS.away
    };
  }

  function makeBall() {
    return {
      x: W / 2,
      y: H / 2,
      vx: 0,
      vy: 0,
      z: 0,
      vz: 0,
      spin: 0,
      owner: null,
      lastTeam: null,
      lastShooter: null,
      shot: false,
      pass: false,
      speed: 0,
      history: []
    };
  }

  function setupEntities() {
    player = makePlayer(220, goalY(), "home", "captain", 10);
    player.speed = 205;
    player.sprintSpeed = 295;

    homePlayers = [player];
    awayPlayers = [];

    const homeFormation = [
      [150, 145], [150, 270], [150, 395],
      [330, 135], [330, 270], [330, 405],
      [440, 205], [440, 335]
    ];

    homeFormation.forEach((pos, i) => {
      homePlayers.push(
        makePlayer(pos[0], pos[1], "home", "field", i + 2)
      );
    });

    const awayFormation = [
      [805, 145], [805, 270], [805, 395],
      [650, 135], [650, 270], [650, 405],
      [545, 205], [545, 335]
    ];

    awayFormation.forEach((pos, i) => {
      awayPlayers.push(
        makePlayer(pos[0], pos[1], "away", "field", i + 2)
      );
    });

    keeperHome = makePlayer(FIELD.x + 23, goalY(), "home", "keeper", 1);
    keeperAway = makePlayer(FIELD.x + FIELD.w - 23, goalY(), "away", "keeper", 1);

    ball = makeBall();
    attachBall(player);
  }

  function attachBall(p) {
    if (!p || !ball) return;

    ball.owner = p;
    p.hasBall = true;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    ball.z = 0;
    ball.shot = false;
    ball.pass = false;

    ball.x = p.x + Math.cos(p.direction) * 16;
    ball.y = p.y + Math.sin(p.direction) * 16;
  }

  function releaseBall() {
    if (ball.owner) {
      ball.owner.hasBall = false;
      ball.owner = null;
    }
  }

  function resetKickoff(scoringTeam) {
    const center = goalY();

    homePlayers.forEach((p, i) => {
      p.x = i === 0 ? 220 : 130 + (i % 3) * 115;
      p.y = i === 0 ? center : FIELD.y + 70 + Math.floor(i / 3) * 115;
      p.vx = 0;
      p.vy = 0;
      p.hasBall = false;
      p.stamina = Math.max(p.stamina, 65);
    });

    awayPlayers.forEach((p, i) => {
      p.x = 810 - (i % 3) * 100;
      p.y = FIELD.y + 70 + Math.floor(i / 3) * 115;
      p.vx = 0;
      p.vy = 0;
      p.hasBall = false;
    });

    keeperHome.y = center;
    keeperAway.y = center;

    ball = makeBall();

    if (scoringTeam === "home") {
      attachBall(player);
    } else {
      attachBall(awayPlayers[4]);
    }

    kickCooldown = 0.6;
    showToast(scoringTeam === "home" ? "UNITED SCORES!" : "RANGERS SCORES!", 1.5);
  }

  // ---------- MATCH MANAGEMENT ----------
  function startMatch() {
    mode = document.querySelector(".mode-card.selected")?.dataset.mode || "quick";

    menuScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    pauseOverlay.classList.add("hidden");
    resultOverlay.classList.add("hidden");

    $("modeLabel").textContent = {
      quick: "QUICK MATCH",
      training: "TRAINING GROUND",
      survival: "SURVIVAL MODE"
    }[mode];

    $("durationLabel").textContent = formatTime(MATCH_LENGTH);

    resetMatch();
    canvas.focus();
  }

  function resetMatch() {
    elapsed = 0;
    remaining = MATCH_LENGTH;

    homeScore = 0;
    awayScore = 0;
    shots = 0;
    goals = 0;
    saves = 0;

    totalHomePossession = 0;
    totalAwayPossession = 0;

    charge = 0;
    charging = false;
    paused = false;
    ended = false;
    running = true;

    particles.length = 0;
    floatingTexts.length = 0;
    trails.length = 0;
    keys.clear();

    setupEntities();
    updateHUD();

    pauseOverlay.classList.add("hidden");
    resultOverlay.classList.add("hidden");

    lastTime = performance.now();
    showToast(mode === "training" ? "TRAINING START!" : "KICK OFF!", 1.2);
  }

  function togglePause() {
    if (!running || ended) return;

    paused = !paused;
    pauseOverlay.classList.toggle("hidden", !paused);
    keys.clear();
    charging = false;
    charge = 0;
    updateChargeHUD();

    if (!paused) {
      lastTime = performance.now();
      canvas.focus();
    }
  }

  function finishMatch() {
    ended = true;
    running = false;
    paused = false;
    charging = false;

    pauseOverlay.classList.add("hidden");

    $("finalHome").textContent = homeScore;
    $("finalAway").textContent = awayScore;
    $("shotsStat").textContent = shots;
    $("goalsStat").textContent = goals;
    $("savesStat").textContent = saves;

    if (homeScore > awayScore) {
      $("resultTitle").textContent = "VICTORY!";
      $("resultText").textContent = "En sterk prestasjon! Du vant kampen.";
    } else if (homeScore < awayScore) {
      $("resultTitle").textContent = "FULL TIME.";
      $("resultText").textContent = "Motstanderen vant denne gangen. Prøv igjen!";
    } else {
      $("resultTitle").textContent = "DRAW GAME.";
      $("resultText").textContent = "En jevn kamp. Begge lag deler poengene.";
    }

    resultOverlay.classList.remove("hidden");
    sound(540, 0.2, "triangle", 0.05);
    setTimeout(() => sound(680, 0.28, "triangle", 0.04), 140);
  }

  function goToMenu() {
    running = false;
    paused = false;
    ended = false;
    charging = false;
    keys.clear();

    gameScreen.classList.add("hidden");
    menuScreen.classList.remove("hidden");
    pauseOverlay.classList.add("hidden");
    resultOverlay.classList.add("hidden");
  }

  // ---------- INPUT ----------
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
    }

    if (key === "escape") {
      if (!gameScreen.classList.contains("hidden") && !ended) {
        togglePause();
      }
      return;
    }

    if (!running || paused || ended) return;

    if (key === " " && !event.repeat && mode !== "training" ? true : false) {
      // Shooting is allowed in every mode; see the handler below.
    }

    if (key === " " && !event.repeat) {
      charging = true;
      charge = 0;
      sound(220, 0.03, "sine", 0.012);
    }

    if (key === "e" && !event.repeat) passBall();
    if (key === "q" && !event.repeat) switchPlayer();
    if (key === "r" && !event.repeat) resetMatch();

    keys.add(key);
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();

    if (key === " ") {
      if (charging && running && !paused && !ended) shootBall();
      charging = false;
      charge = 0;
      updateChargeHUD();
    }

    keys.delete(key);
  });

  window.addEventListener("blur", () => {
    keys.clear();
    charging = false;
    charge = 0;
    updateChargeHUD();
  });

  function getCanvasPointer(event) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) / rect.width * W,
      y: (event.clientY - rect.top) / rect.height * H
    };
  }

  canvas.addEventListener("pointermove", (event) => {
    pointer = { ...getCanvasPointer(event), inside: true };
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.inside = false;
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!running || paused || ended) return;

    pointer = { ...getCanvasPointer(event), inside: true };
    canvas.focus();
  });

  // ---------- AIMING ----------
  function getAimDirection() {
    if (pointer.inside) {
      const from = ball.owner || player;
      const direction = normalize(pointer.x - from.x, pointer.y - from.y);

      if (direction.x !== 0 || direction.y !== 0) return direction;
    }

    return { x: 1, y: 0 };
  }

  // ---------- SHOOTING ----------
  function shootBall() {
    if (!ball.owner || ball.owner.team !== "home") {
      showToast("WIN THE BALL!", 0.7);
      return;
    }

    if (kickCooldown > 0) return;

    const shooter = ball.owner;
    const aim = getAimDirection();
    const power = clamp(charge / MAX_CHARGE, 0, 1);

    const baseSpeed = mode === "training" ? 300 : 270;
    const velocity = baseSpeed + power * 340;

    releaseBall();

    ball.vx = aim.x * velocity;
    ball.vy = aim.y * velocity;
    ball.vz = 80 + power * 180;
    ball.z = 2;
    ball.spin = rand(-4, 4);
    ball.lastTeam = "home";
    ball.lastShooter = shooter;
    ball.shot = true;
    ball.pass = false;

    shooter.vx -= aim.x * 25;
    shooter.vy -= aim.y * 25;
    shooter.direction = Math.atan2(aim.y, aim.x);

    shots++;
    kickCooldown = 0.28;

    burst(ball.x, ball.y, "#dfffbc", 7, 65);
    addFloatingText(shooter.x, shooter.y - 25, `${Math.round(power * 100)}% POWER`, COLORS.home);

    sound(170 + power * 130, 0.12, "triangle", 0.055);
    updateHUD();
  }

  function passBall() {
    if (!ball.owner || ball.owner.team !== "home" || passCooldown > 0) return;

    const passer = ball.owner;

    const teammates = homePlayers
      .filter((p) => p !== passer)
      .sort((a, b) => {
        const da = dist(a, passer);
        const db = dist(b, passer);
        return da - db;
      });

    let target = teammates[0];

    if (pointer.inside && teammates.length) {
      target = teammates.reduce((best, p) => {
        const aimDistance = Math.hypot(p.x - pointer.x, p.y - pointer.y);
        const bestDistance = Math.hypot(best.x - pointer.x, best.y - pointer.y);
        return aimDistance < bestDistance ? p : best;
      }, teammates[0]);
    }

    if (!target) return;

    const direction = normalize(target.x - passer.x, target.y - passer.y);

    releaseBall();

    ball.vx = direction.x * 350;
    ball.vy = direction.y * 350;
    ball.vz = 18;
    ball.lastTeam = "home";
    ball.lastShooter = passer;
    ball.shot = false;
    ball.pass = true;

    passer.direction = Math.atan2(direction.y, direction.x);
    passCooldown = 0.35;

    showToast("PASS!", 0.45);
    sound(280, 0.05, "sine", 0.025);
  }

  function switchPlayer() {
    if (switchCooldown > 0) return;

    const candidates = homePlayers.filter((p) => p !== player);
    if (!candidates.length) return;

    let next;

    if (ball.owner && ball.owner.team === "home") {
      next = ball.owner;
    } else {
      next = candidates.reduce((best, p) => {
        const d = dist(p, ball);
        return d < dist(best, ball) ? p : best;
      }, candidates[0]);
    }

    if (next) {
      player = next;
      player.speed = Math.max(player.speed, 190);
      player.sprintSpeed = Math.max(player.sprintSpeed, 270);
      switchCooldown = 0.3;
      showToast(`PLAYER #${player.number}`, 0.5);
    }
  }

  // ---------- MOVEMENT ----------
  function updateHuman(dt) {
    if (!player) return;

    let dx = 0;
    let dy = 0;

    if (keys.has("w") || keys.has("arrowup")) dy -= 1;
    if (keys.has("s") || keys.has("arrowdown")) dy += 1;
    if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
    if (keys.has("d") || keys.has("arrowright")) dx += 1;

    const input = normalize(dx, dy);
    const sprinting = keys.has("shift") && player.stamina > 0 && (dx || dy);
    const maxSpeed = sprinting ? player.sprintSpeed : player.speed;

    if (sprinting) {
      player.stamina = Math.max(0, player.stamina - 28 * dt);
    } else {
      player.stamina = Math.min(100, player.stamina + 14 * dt);
    }

    const carryingBall = ball.owner === player;
    const targetVx = input.x * maxSpeed;
    const targetVy = input.y * maxSpeed;

    const response = carryingBall ? 8 : 12;

    player.vx = lerp(player.vx, targetVx, clamp(dt * response, 0, 1));
    player.vy = lerp(player.vy, targetVy, clamp(dt * response, 0, 1));

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (dx || dy) {
      player.direction = Math.atan2(dy, dx);
    } else if (pointer.inside && !charging) {
      player.direction = Math.atan2(pointer.y - player.y, pointer.x - player.x);
    }

    clampPlayer(player);

    if (carryingBall) {
      const offset = carryingBall ? 18 : 0;
      const targetX = player.x + Math.cos(player.direction) * offset;
      const targetY = player.y + Math.sin(player.direction) * offset;

      ball.x = lerp(ball.x, targetX, clamp(dt * 16, 0, 1));
      ball.y = lerp(ball.y, targetY, clamp(dt * 16, 0, 1));
    }
  }

  function moveAIPlayer(p, targetX, targetY, dt, sprint = false) {
    const dx = targetX - p.x;
    const dy = targetY - p.y;
    const d = Math.hypot(dx, dy);

    if (d > 2) {
      const direction = normalize(dx, dy);
      const speed = sprint ? p.sprintSpeed : p.speed;

      p.vx = lerp(p.vx, direction.x * speed, clamp(dt * 4.5, 0, 1));
      p.vy = lerp(p.vy, direction.y * speed, clamp(dt * 4.5, 0, 1));
      p.direction = Math.atan2(dy, dx);

      p.x += p.vx * dt;
      p.y += p.vy * dt;
    } else {
      p.vx *= 0.85;
      p.vy *= 0.85;
    }

    clampPlayer(p);
  }

  function updateTeamAI(team, dt) {
    const teammates = team === "home" ? homePlayers : awayPlayers;
    const opponents = team === "home" ? awayPlayers : homePlayers;

    for (const p of teammates) {
      if (p === player) continue;

      p.aiTimer -= dt;

      const hasPossession = ball.owner === p;
      const attackingRight = team === "home";
      const attackDirection = attackingRight ? 1 : -1;

      let targetX;
      let targetY;

      if (hasPossession) {
        const goalX = attackingRight ? FIELD.x + FIELD.w : FIELD.x;
        const pressure = opponents.some((op) => dist(op, p) < 65);

        if (Math.abs(goalX - p.x) < 200 && !pressure) {
          const shotAim = normalize(goalX - p.x, goalY() - p.y);

          if (Math.random() < dt * 0.65) {
            releaseBall();
            ball.vx = shotAim.x * 330;
            ball.vy = shotAim.y * 330;
            ball.vz = 65;
            ball.lastTeam = team;
            ball.lastShooter = p;
            ball.shot = true;
            shots++;
          }
        }

        targetX = p.x + attackDirection * 150;
        targetY = lerp(p.y, goalY(), dt * 0.5);
      } else {
        const chasing = !ball.owner && p === nearestPlayer(teammates, ball);

        if (chasing || (!ball.owner && dist(p, ball) < 190)) {
          targetX = ball.x + ball.vx * 0.12;
          targetY = ball.y + ball.vy * 0.12;
        } else if (ball.owner && ball.owner.team !== team) {
          const shouldPress = dist(p, ball.owner) < 190;
          targetX = shouldPress ? ball.owner.x : lerp(p.x, ball.x, 0.12);
          targetY = shouldPress ? ball.owner.y : lerp(p.y, ball.y, 0.12);
        } else {
          targetX = p.x + attackDirection * 18;
          targetY = p.y;
        }
      }

      targetX = clamp(targetX, FIELD.x + 35, FIELD.x + FIELD.w - 35);
      targetY = clamp(targetY, FIELD.y + 25, FIELD.y + FIELD.h - 25);

      if (p.aiTimer <= 0) {
        p.targetX = targetX;
        p.targetY = targetY;
        p.aiTimer = rand(0.15, 0.35);
      }

      moveAIPlayer(
        p,
        lerp(p.x, p.targetX, 0.6),
        lerp(p.y, p.targetY, 0.6),
        dt,
        hasPossession || (!ball.owner && dist(p, ball) < 150)
      );
    }
  }

  function nearestPlayer(team, target) {
    return team.reduce((best, p) => {
      return dist(p, target) < dist(best, target) ? p : best;
    }, team[0]);
  }

  function updateKeepers(dt) {
    const goalYPosition = goalY();

    for (const keeper of [keeperHome, keeperAway]) {
      const isHome = keeper.team === "home";

      const x = isHome ? FIELD.x + 23 : FIELD.x + FIELD.w - 23;
      keeper.x = x;

      let targetY = goalYPosition;

      const ballThreatening = isHome
        ? ball.x < FIELD.x + 250
        : ball.x > FIELD.x + FIELD.w - 250;

      if (ballThreatening) {
        targetY = clamp(ball.y, goalYPosition - 48, goalYPosition + 48);
      }

      keeper.y = lerp(keeper.y, targetY, clamp(dt * 3.2, 0, 1));
      keeper.direction = isHome ? 0 : Math.PI;
    }
  }

  // ---------- BALL PHYSICS ----------
  function updateBall(dt) {
    if (ball.owner) {
      if (ball.owner === player) {
        ball.x = player.x + Math.cos(player.direction) * 18;
        ball.y = player.y + Math.sin(player.direction) * 18;
      } else {
        ball.x = ball.owner.x + Math.cos(ball.owner.direction) * 18;
        ball.y = ball.owner.y + Math.sin(ball.owner.direction) * 18;
      }
      return;
    }

    const speed = Math.hypot(ball.vx, ball.vy);
    ball.speed = speed;

    ball.history.push({ x: ball.x, y: ball.y });
    if (ball.history.length > 9) ball.history.shift();

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Ball height creates a simple 3D-style arc.
    ball.z += ball.vz * dt;
    ball.vz -= 420 * dt;

    if (ball.z < 0) {
      ball.z = 0;
      ball.vz = Math.abs(ball.vz) > 45 ? Math.abs(ball.vz) * 0.3 : 0;
      ball.vx *= 0.88;
      ball.vy *= 0.88;
      sound(110, 0.025, "sine", 0.009);
    }

    ball.vx *= Math.pow(0.985, dt * 60);
    ball.vy *= Math.pow(0.985, dt * 60);
    ball.spin += dt * speed * 0.01;

    // Side lines.
    if (ball.y < FIELD.y + BALL_RADIUS) {
      ball.y = FIELD.y + BALL_RADIUS;
      ball.vy = Math.abs(ball.vy) * 0.72;
    }

    if (ball.y > FIELD.y + FIELD.h - BALL_RADIUS) {
      ball.y = FIELD.y + FIELD.h - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy) * 0.72;
    }

    // Goal checks.
    if (ball.x < FIELD.x - 2) {
      if (Math.abs(ball.y - goalY()) < GOAL.height / 2 && ball.z < 65) {
        scoreGoal("away");
      } else {
        ball.x = FIELD.x + BALL_RADIUS;
        ball.vx = Math.abs(ball.vx) * 0.68;
      }
    }

    if (ball.x > FIELD.x + FIELD.w + 2) {
      if (Math.abs(ball.y - goalY()) < GOAL.height / 2 && ball.z < 65) {
        scoreGoal("home");
      } else {
        ball.x = FIELD.x + FIELD.w - BALL_RADIUS;
        ball.vx = -Math.abs(ball.vx) * 0.68;
      }
    }

    if (ball.owner) return;

    checkKeeperSave(keeperHome);
    checkKeeperSave(keeperAway);

    checkPlayerCollisions(homePlayers);
    checkPlayerCollisions(awayPlayers);

    // Stop a very slow ball so it can be collected.
    if (Math.hypot(ball.vx, ball.vy) < 10 && ball.z === 0) {
      ball.vx = 0;
      ball.vy = 0;
    }
  }

  function checkKeeperSave(keeper) {
    if (ball.owner || ball.z > 40) return;

    const d = dist(ball, keeper);

    if (d < keeper.radius + BALL_RADIUS + 2) {
      if (ball.shot) {
        saves++;
        addFloatingText(keeper.x, keeper.y - 30, "SAVE!", "#ffffff");
        burst(ball.x, ball.y, "#ffffff", 8, 80);
        sound(130, 0.08, "triangle", 0.04);
      }

      const direction = normalize(ball.x - keeper.x, ball.y - keeper.y);

      ball.vx = direction.x * Math.max(160, Math.abs(ball.vx) * 0.75);
      ball.vy = direction.y * Math.max(110, Math.abs(ball.vy) * 0.75);
      ball.vz = 65;
      ball.z = 3;
      ball.shot = false;
      ball.pass = false;
    }
  }

  function checkPlayerCollisions(team) {
    if (ball.owner || ball.z > 20) return;

    for (const p of team) {
      if (p.role === "keeper" || p === player && ball.owner === p) continue;

      const d = dist(ball, p);
      const captureDistance = p.radius + BALL_RADIUS + 3;

      if (d < captureDistance) {
        const direction = normalize(ball.x - p.x, ball.y - p.y);

        if (ball.shot && d < captureDistance * 0.8) {
          ball.vx = direction.x * Math.max(110, Math.abs(ball.vx) * 0.45);
          ball.vy = direction.y * Math.max(90, Math.abs(ball.vy) * 0.45);
          ball.shot = false;
          ball.z = 1;
        } else if (Math.hypot(ball.vx, ball.vy) < 230) {
          attachBall(p);
        }
      }
    }
  }

  function scoreGoal(team) {
    if (ended) return;

    if (team === "home") {
      homeScore++;
      goals++;
      addFloatingText(W / 2, goalY(), "GOAL!", COLORS.home);
      burst(W - FIELD.x - 8, goalY(), COLORS.home, 36, 180);
    } else {
      awayScore++;
      addFloatingText(W / 2, goalY(), "GOAL!", COLORS.away);
      burst(FIELD.x + 8, goalY(), COLORS.away, 36, 180);
    }

    sound(450, 0.12, "triangle", 0.06);
    setTimeout(() => sound(600, 0.2, "triangle", 0.04), 100);

    updateHUD();
    resetKickoff(team);
  }

  // ---------- PARTICLES ----------
  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.95, dt * 60);
      p.vy *= Math.pow(0.95, dt * 60);
      p.life -= dt;

      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const t = floatingTexts[i];

      t.y += t.vy * dt;
      t.life -= dt;

      if (t.life <= 0) floatingTexts.splice(i, 1);
    }

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.classList.remove("show");
    }
  }

  // ---------- GAME UPDATE ----------
  function update(dt) {
    if (!running || paused || ended) return;

    elapsed += dt;

    if (mode !== "training") {
      remaining -= dt;

      if (remaining <= 0) {
        remaining = 0;
        updateHUD();
        finishMatch();
        return;
      }
    }

    kickCooldown = Math.max(0, kickCooldown - dt);
    passCooldown = Math.max(0, passCooldown - dt);
    switchCooldown = Math.max(0, switchCooldown - dt);

    if (charging) {
      charge = Math.min(MAX_CHARGE, charge + dt);
      updateChargeHUD();
    }

    updateHuman(dt);
    updateTeamAI("home", dt);
    updateTeamAI("away", dt);
    updateKeepers(dt);
    updateBall(dt);
    updateEffects(dt);

    if (ball.owner?.team === "home") totalHomePossession += dt;
    if (ball.owner?.team === "away") totalAwayPossession += dt;

    possessionTimer += dt;

    if (possessionTimer > 0.2) {
      possessionTimer = 0;
      updateHUD();
    }
  }

  // ---------- HUD ----------
  function updateChargeHUD() {
    const percentage = Math.round(clamp(charge / MAX_CHARGE, 0, 1) * 100);

    $("chargePercent").textContent = `${percentage}%`;
    $("chargeFill").style.width = `${percentage}%`;

    if (percentage > 75) {
      $("chargeFill").style.background = "#ffbf55";
    } else {
      $("chargeFill").style.background = COLORS.home;
    }
  }

  function updateHUD() {
    $("homeScore").textContent = homeScore;
    $("awayScore").textContent = awayScore;

    $("clock").textContent = mode === "training"
      ? formatTime(elapsed)
      : formatTime(remaining);

    const speed = player ? Math.round(Math.hypot(player.vx, player.vy) * 0.36) : 0;
    $("speedStat").textContent = `${speed} km/h`;

    $("powerStat").textContent = charging
      ? `${Math.round(charge / MAX_CHARGE * 100)}%`
      : "READY";

    if (ball.owner?.team === "home") {
      $("possessionStat").textContent = "HOME";
    } else if (ball.owner?.team === "away") {
      $("possessionStat").textContent = "AWAY";
    } else {
      $("possessionStat").textContent = "LOOSE";
    }
  }

  // ---------- DRAWING ----------
  function drawPitch() {
    ctx.fillStyle = "#16271b";
    ctx.fillRect(0, 0, W, H);

    // Stadium background.
    ctx.fillStyle = "#17251b";
    ctx.fillRect(0, 0, W, H);

    // Pitch stripes.
    const stripeCount = 10;
    const stripeWidth = FIELD.w / stripeCount;

    for (let i = 0; i < stripeCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? COLORS.grassA : COLORS.grassB;
      ctx.fillRect(
        FIELD.x + i * stripeWidth,
        FIELD.y,
        stripeWidth + 1,
        FIELD.h
      );
    }

    // Outer shadow.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.25)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 5;
    ctx.strokeRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);
    ctx.restore();

    // Field markings.
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

    // Halfway line.
    ctx.beginPath();
    ctx.moveTo(W / 2, FIELD.y);
    ctx.lineTo(W / 2, FIELD.y + FIELD.h);
    ctx.stroke();

    // Center circle and center spot.
    ctx.beginPath();
    ctx.arc(W / 2, goalY(), 68, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = COLORS.line;
    ctx.beginPath();
    ctx.arc(W / 2, goalY(), 3, 0, Math.PI * 2);
    ctx.fill();

    // Penalty boxes.
    const boxW = 112;
    const boxH = 230;

    ctx.strokeRect(FIELD.x, goalY() - boxH / 2, boxW, boxH);
    ctx.strokeRect(FIELD.x, goalY() - 112 / 2, 52, 112);

    ctx.strokeRect(FIELD.x + FIELD.w - boxW, goalY() - boxH / 2, boxW, boxH);
    ctx.strokeRect(FIELD.x + FIELD.w - 52, goalY() - 112 / 2, 52, 112);

    // Penalty spots.
    ctx.beginPath();
    ctx.arc(FIELD.x + 75, goalY(), 3, 0, Math.PI * 2);
    ctx.arc(FIELD.x + FIELD.w - 75, goalY(), 3, 0, Math.PI * 2);
    ctx.fill();

    // Penalty arcs.
    ctx.beginPath();
    ctx.arc(FIELD.x + 75, goalY(), 44, -0.85, 0.85);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(FIELD.x + FIELD.w - 75, goalY(), 44, Math.PI - 0.85, Math.PI + 0.85);
    ctx.stroke();

    // Goals.
    drawGoal(FIELD.x - 15, goalY());
    drawGoal(FIELD.x + FIELD.w, goalY());

    // Corner arcs.
    const corners = [
      [FIELD.x, FIELD.y, 0],
      [FIELD.x + FIELD.w, FIELD.y, Math.PI / 2],
      [FIELD.x, FIELD.y + FIELD.h, -Math.PI / 2],
      [FIELD.x + FIELD.w, FIELD.y + FIELD.h, Math.PI]
    ];

    for (const [x, y, start] of corners) {
      ctx.beginPath();
      ctx.arc(x, y, 10, start, start + Math.PI / 2);
      ctx.stroke();
    }

    // Small stadium lamps.
    for (let i = 0; i < 8; i++) {
      const x = 90 + i * 112;
      ctx.fillStyle = "rgba(221,255,204,.13)";
      ctx.fillRect(x, 9, 42, 4);
      ctx.fillRect(x, H - 13, 42, 4);
    }
  }

  function drawGoal(x, y) {
    ctx.save();

    ctx.fillStyle = "#e9eee9";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;

    ctx.fillRect(x, y - GOAL.height / 2, 15, GOAL.height);
    ctx.strokeRect(x, y - GOAL.height / 2, 15, GOAL.height);

    ctx.strokeStyle = "rgba(255,255,255,.3)";
    ctx.lineWidth = 1;

    for (let i = 1; i < 5; i++) {
      const lineY = y - GOAL.height / 2 + i * GOAL.height / 5;
      ctx.beginPath();
      ctx.moveTo(x, lineY);
      ctx.lineTo(x + 15, lineY);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPlayer(p) {
    const isSelected = p === player;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Player shadow.
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath();
    ctx.ellipse(2, 7, p.radius * 1.1, p.radius * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Selected-player indicator.
    if (isSelected) {
      ctx.strokeStyle = "rgba(225,255,191,.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.radius + 7, p.radius + 7, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = COLORS.home;
      ctx.beginPath();
      ctx.moveTo(-5, -p.radius - 13);
      ctx.lineTo(5, -p.radius - 13);
      ctx.lineTo(0, -p.radius - 6);
      ctx.fill();
    }

    // Feet.
    const runningAmount = Math.hypot(p.vx, p.vy) > 35 ? Math.sin(elapsed * 13 + p.number) * 3 : 0;

    ctx.fillStyle = "#e5e7df";
    ctx.beginPath();
    ctx.ellipse(-5, 7 + runningAmount, 4, 5, -0.3, 0, Math.PI * 2);
    ctx.ellipse(5, 7 - runningAmount, 4, 5, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Body.
    ctx.fillStyle = p.team === "home" ? COLORS.home : COLORS.away;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();

    // Jersey outline.
    ctx.strokeStyle = p.team === "home" ? "#efffd5" : "#ffc2bf";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Jersey details.
    ctx.fillStyle = p.team === "home" ? COLORS.homeDark : COLORS.awayDark;
    ctx.fillRect(-3, -p.radius + 3, 6, p.radius * 1.1);

    // Head.
    ctx.fillStyle = "#f0c9a4";
    ctx.beginPath();
    ctx.arc(0, -p.radius * 0.25, p.radius * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Number.
    ctx.fillStyle = "#132016";
    ctx.font = `bold ${p.radius < 14 ? 8 : 10}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.number), 0, 4);

    // Direction indicator.
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.direction) * 7, Math.sin(p.direction) * 7);
    ctx.lineTo(Math.cos(p.direction) * 15, Math.sin(p.direction) * 15);
    ctx.stroke();

    // Stamina bar for selected player.
    if (isSelected && p.stamina < 99) {
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(-15, -p.radius - 12, 30, 4);
      ctx.fillStyle = COLORS.home;
      ctx.fillRect(-15, -p.radius - 12, 30 * p.stamina / 100, 4);
    }

    ctx.restore();
  }

  function drawBall() {
    // Flight trail.
    if (ball.history.length > 2 && Math.hypot(ball.vx, ball.vy) > 100) {
      for (let i = 0; i < ball.history.length; i++) {
        const t = i / ball.history.length;
        const p = ball.history[i];

        ctx.fillStyle = `rgba(255,255,255,${t * 0.13})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y - ball.z * 0.15, BALL_RADIUS * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ground shadow.
    ctx.fillStyle = `rgba(0,0,0,${0.22 - Math.min(ball.z / 600, 0.12)})`;
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 5, BALL_RADIUS + ball.z * 0.025, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(ball.x, ball.y - ball.z * 0.3);
    ctx.rotate(ball.spin);

    ctx.fillStyle = COLORS.ball;
    ctx.strokeStyle = "#1b211d";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#4a554d";
    ctx.lineWidth = 0.7;

    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.lineTo(4, 2);
    ctx.moveTo(-2, 4);
    ctx.lineTo(3, -4);
    ctx.stroke();

    ctx.restore();
  }

  function drawAim() {
    if (!player || !ball || !running || paused || ended) return;

    if (ball.owner !== player) return;

    const aim = getAimDirection();
    const length = 90 + (charge / MAX_CHARGE) * 75;

    ctx.save();
    ctx.strokeStyle = charging ? "#fff3a8" : "rgba(240,255,226,.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);

    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ball.x + aim.x * length, ball.y + aim.y * length);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = charging ? "#fff3a8" : COLORS.home;

    ctx.beginPath();
    ctx.arc(ball.x + aim.x * length, ball.y + aim.y * length, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawEffects() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;

    for (const t of floatingTexts) {
      ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
      ctx.fillStyle = t.color;
      ctx.font = "900 17px Arial";
      ctx.textAlign = "center";
      ctx.fillText(t.text, t.x, t.y);
    }

    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    drawPitch();

    // Sort by vertical position to simulate depth.
    const entities = [
      ...homePlayers,
      ...awayPlayers,
      keeperHome,
      keeperAway
    ].sort((a, b) => a.y - b.y);

    for (const p of entities) {
      drawPlayer(p);
    }

    drawAim();
    drawBall();
    drawEffects();
  }

  // ---------- MAIN LOOP ----------
  function loop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.033);
    lastTime = timestamp;

    if (running && !paused && !ended) {
      update(dt);
    }

    if (!gameScreen.classList.contains("hidden")) {
      render();
    }

    requestAnimationFrame(loop);
  }

  // ---------- MENU EVENTS ----------
  playBtn.addEventListener("click", startMatch);

  howBtn.addEventListener("click", () => {
    helpPanel.classList.toggle("hidden");

    if (!helpPanel.classList.contains("hidden")) {
      helpPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });

  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".mode-card").forEach((item) => {
        item.classList.remove("selected");
      });

      card.classList.add("selected");
    });
  });

  pauseBtn.addEventListener("click", togglePause);
  resumeBtn.addEventListener("click", togglePause);
  restartBtn.addEventListener("click", resetMatch);
  againBtn.addEventListener("click", startMatch);
  backBtn.addEventListener("click", goToMenu);
  quitBtn.addEventListener("click", goToMenu);
  resultMenuBtn.addEventListener("click", goToMenu);

  $("soundBtn").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    $("soundBtn").textContent = soundEnabled ? "🔊" : "🔇";
    $("soundBtn").setAttribute(
      "aria-label",
      soundEnabled ? "Slå lyd av" : "Slå lyd på"
    );

    if (soundEnabled) sound(500, 0.08);
  });

  // Prevent accidental browser navigation while playing.
  window.addEventListener("contextmenu", (event) => {
    if (!gameScreen.classList.contains("hidden")) {
      event.preventDefault();
    }
  });

  // ---------- INITIALIZE ----------
  function init() {
    canvas.width = W;
    canvas.height = H;

    setupEntities();
    updateHUD();
    updateChargeHUD();

    requestAnimationFrame((timestamp) => {
      lastTime = timestamp;
      requestAnimationFrame(loop);
    });
  }

  init();
})();
