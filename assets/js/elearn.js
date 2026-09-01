import { supabase } from "./supabase-client.js";
import { getIdentity } from "./auth.js";
import { isFirmAdmin } from "./permissions.js";

const EDIT_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

let activeTab = "progress";
let categoriesCache = [];
let coursesCache = [];
let progressCache = [];
let annualHourGoal = 20;
let expandedCourseId = null;

function isAdmin() {
  return isFirmAdmin();
}

export async function renderElearn(el) {
  activeTab = "progress";
  expandedCourseId = null;

  el.innerHTML = `
    <div class="page-header"><h1>E-Learn</h1></div>
    <div class="tab-nav" style="display:flex;gap:4px;border-bottom:1px solid var(--gray-200);margin-bottom:20px;">
      <button type="button" class="tab-btn" data-tab="progress">My Progress</button>
      <button type="button" class="tab-btn" data-tab="courses">All Courses</button>
      ${isAdmin() ? `<button type="button" class="tab-btn" data-tab="staffprogress">Staff Progress</button>` : ""}
    </div>
    <div id="elearn-tab-content"></div>
  `;

  await loadSharedData();
  wireTabs(el);
  renderActiveTab();
}

async function loadSharedData() {
  const orgId = getIdentity()?.organisationId;
  const selfId = getIdentity()?.user?.id;
  const [{ data: categories }, { data: courses }, { data: progress }, { data: settings }] = await Promise.all([
    supabase.from("elearn_categories").select("id, name, sort_order").eq("organisation_id", orgId).order("sort_order"),
    supabase.from("elearn_courses").select("id, category_id, title, video_url, video_provider, duration_minutes, outline, learning_material, sort_order, active").eq("organisation_id", orgId).order("sort_order"),
    supabase.from("elearn_progress").select("*").eq("user_id", selfId),
    supabase.from("organisation_settings").select("elearn_annual_hour_goal").eq("organisation_id", orgId).maybeSingle(),
  ]);
  categoriesCache = categories || [];
  coursesCache = courses || [];
  progressCache = progress || [];
  annualHourGoal = settings?.elearn_annual_hour_goal ?? 20;
}

function wireTabs(el) {
  el.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      renderActiveTab();
    });
  });
}

function renderActiveTab() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const isActive = btn.dataset.tab === activeTab;
    btn.style.cssText = `padding:10px 18px;border:none;background:none;font-size:14px;cursor:pointer;border-bottom:2px solid ${isActive ? "var(--gray-900)" : "transparent"};font-weight:${isActive ? "600" : "400"};color:${isActive ? "var(--gray-900)" : "var(--gray-500)"};`;
  });
  const container = document.getElementById("elearn-tab-content");
  if (activeTab === "progress") renderMyProgressTab(container);
  else if (activeTab === "staffprogress") renderStaffProgressTab(container);
  else renderAllCoursesTab(container);
}

function progressFor(courseId) {
  return progressCache.find((p) => p.course_id === courseId) || null;
}

// ---------- My Progress tab ----------

function renderMyProgressTab(container) {
  const activeCourses = coursesCache.filter((c) => c.active);
  const completed = activeCourses.filter((c) => progressFor(c.id)?.completed_at);
  const totalCount = activeCourses.length;
  const completedCount = completed.length;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const thisYear = new Date().getFullYear();
  const hoursThisYear = completed
    .filter((c) => new Date(progressFor(c.id).completed_at).getFullYear() === thisYear)
    .reduce((sum, c) => sum + (c.duration_minutes || 0), 0) / 60;
  const hoursPct = annualHourGoal > 0 ? Math.min(100, Math.round((hoursThisYear / annualHourGoal) * 100)) : 0;

  container.innerHTML = `
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:24px;">
      <div class="import-card" style="flex:1 1 320px;">
        <h3 style="margin-top:0;">Courses Completed</h3>
        <div style="display:flex;align-items:baseline;gap:10px;margin:16px 0;">
          <span style="font-size:40px;font-weight:700;">${completedCount}</span>
          <span style="color:var(--gray-500);">of ${totalCount}</span>
        </div>
        <div style="background:var(--gray-100);border-radius:8px;height:14px;overflow:hidden;">
          <div style="background:#2563eb;height:100%;width:${pct}%;transition:width 0.3s;"></div>
        </div>
        <p class="hint" style="margin-top:8px;">${pct}% complete — ${totalCount - completedCount} course${totalCount - completedCount === 1 ? "" : "s"} to go</p>
      </div>
      <div class="import-card" style="flex:1 1 320px;">
        <h3 style="margin-top:0;">Hours This Year</h3>
        <div style="display:flex;align-items:baseline;gap:10px;margin:16px 0;">
          <span style="font-size:40px;font-weight:700;">${hoursThisYear.toFixed(1)}</span>
          <span style="color:var(--gray-500);">of ${annualHourGoal} hrs goal</span>
        </div>
        <div style="background:var(--gray-100);border-radius:8px;height:14px;overflow:hidden;">
          <div style="background:${hoursPct >= 100 ? "#16a34a" : "#f59e0b"};height:100%;width:${hoursPct}%;transition:width 0.3s;"></div>
        </div>
        <p class="hint" style="margin-top:8px;">${hoursPct}% of this year's goal</p>
      </div>
    </div>

    <div class="import-card">
      <h3 style="margin-top:0;">Completed Courses</h3>
      ${completed.length ? `
        <table class="data-table">
          <thead><tr><th>Course</th><th>Quiz Score</th><th>Completed</th><th>Certificate</th></tr></thead>
          <tbody>
            ${completed.map((c) => {
              const p = progressFor(c.id);
              return `<tr>
                <td>${c.title}</td>
                <td>${p.best_quiz_score != null ? `${p.best_quiz_score}%` : "-"}</td>
                <td>${new Date(p.completed_at).toLocaleDateString()}</td>
                <td><button class="btn-link" data-cert="${c.id}">Download</button></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      ` : `<p class="hint">No courses completed yet — head to All Courses to get started.</p>`}
    </div>
  `;

  container.querySelectorAll("[data-cert]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const course = coursesCache.find((c) => c.id === btn.dataset.cert);
      const p = progressFor(course.id);
      generateCertificate(course, p);
    });
  });
}

// ---------- Staff Progress tab (admin only) ----------

async function renderStaffProgressTab(container) {
  container.innerHTML = `<p class="hint">Loading...</p>`;
  const orgId = getIdentity()?.organisationId;

  const [{ data: members }, { data: allProgress }] = await Promise.all([
    supabase.from("organisation_members").select("user_id, profiles(display_name, email)").eq("organisation_id", orgId).eq("status", "active").eq("is_working_staff", true),
    supabase.from("elearn_progress").select("user_id, course_id, best_quiz_score, quiz_passed, completed_at"),
  ]);

  const activeCourses = coursesCache.filter((c) => c.active);
  const totalCount = activeCourses.length;
  const thisYear = new Date().getFullYear();

  const rows = (members || []).map((m) => {
    const mine = (allProgress || []).filter((p) => p.user_id === m.user_id);
    const completed = mine.filter((p) => p.completed_at && activeCourses.some((c) => c.id === p.course_id));
    const completedThisYear = completed.filter((p) => new Date(p.completed_at).getFullYear() === thisYear);
    const hoursThisYear = completedThisYear.reduce((sum, p) => {
      const course = activeCourses.find((c) => c.id === p.course_id);
      return sum + (course?.duration_minutes || 0);
    }, 0) / 60;
    return {
      name: m.profiles?.display_name || m.profiles?.email || "Unknown",
      completedCount: completed.length,
      hoursThisYear,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  container.innerHTML = `
    <div class="import-card">
      <h3 style="margin-top:0;">Staff Progress</h3>
      <p class="hint">Courses completed and hours logged this year (${thisYear}), across all working staff. Annual goal: ${annualHourGoal} hrs.</p>
      ${rows.length ? `
        <table class="data-table" style="margin-top:12px;">
          <thead><tr><th>Staff</th><th>Courses Completed</th><th>Hours This Year</th><th>Goal Progress</th></tr></thead>
          <tbody>
            ${rows.map((r) => {
              const pct = annualHourGoal > 0 ? Math.min(100, Math.round((r.hoursThisYear / annualHourGoal) * 100)) : 0;
              return `<tr>
                <td>${r.name}</td>
                <td>${r.completedCount} of ${totalCount}</td>
                <td>${r.hoursThisYear.toFixed(1)} hrs</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="background:var(--gray-100);border-radius:6px;height:10px;width:100px;overflow:hidden;">
                      <div style="background:${pct >= 100 ? "#16a34a" : "#f59e0b"};height:100%;width:${pct}%;"></div>
                    </div>
                    <span class="hint">${pct}%</span>
                  </div>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      ` : `<p class="hint">No working staff found.</p>`}
    </div>
  `;
}



// ---------- All Courses tab ----------

function renderAllCoursesTab(container) {
  const admin = isAdmin();
  const grouped = {};
  coursesCache.forEach((c) => {
    if (!admin && !c.active) return;
    const key = c.category_id || "__none";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });
  const categoryOrder = [...categoriesCache.map((cat) => cat.id), "__none"];

  container.innerHTML = `
    ${admin ? `
      <div style="display:flex;gap:10px;margin-bottom:16px;">
        <button id="elearn-add-category-btn" class="btn-secondary">+ Add Category</button>
        <button id="elearn-add-course-btn" class="btn-dark">+ Add Course</button>
      </div>
    ` : ""}
    <div id="elearn-course-groups"></div>
  `;

  const groupsWrap = document.getElementById("elearn-course-groups");
  if (!coursesCache.length) {
    groupsWrap.innerHTML = `<div class="import-card"><div class="empty-state">No courses available yet.</div></div>`;
  } else {
    groupsWrap.innerHTML = categoryOrder
      .filter((catId) => grouped[catId]?.length)
      .map((catId) => {
        const cat = categoriesCache.find((c) => c.id === catId);
        const label = cat ? cat.name : "Uncategorised";
        const courses = grouped[catId].sort((a, b) => a.sort_order - b.sort_order);
        return `
          <div class="import-card" style="margin-bottom:16px;">
            <h3 style="margin-top:0;">${label}</h3>
            <div class="course-list">
              ${courses.map((c) => courseRowHtml(c, admin)).join("")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  wireCourseRows(container, admin);

  if (admin) {
    document.getElementById("elearn-add-category-btn").addEventListener("click", () => openCategoryModal());
    document.getElementById("elearn-add-course-btn").addEventListener("click", () => openCourseModal());
  }
}

function courseRowHtml(c, admin) {
  const p = progressFor(c.id);
  const statusBadge = p?.completed_at
    ? `<span class="status-badge status-completed">Completed</span>`
    : p?.watched_percent > 0
    ? `<span class="status-badge status-wip">${Math.round(p.watched_percent)}% watched</span>`
    : `<span class="status-badge status-not-started">Not started</span>`;
  return `
    <div class="course-row" data-course-row="${c.id}" style="border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;overflow:hidden;">
      <div class="course-row-header" data-toggle-course="${c.id}" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;">
        <div style="display:flex;align-items:center;gap:12px;">
          <strong>${c.title}${!c.active ? ` <span class="hint">(inactive)</span>` : ""}</strong>
          <span class="hint">${c.duration_minutes} min</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          ${statusBadge}
          ${admin ? `<button class="icon-btn icon-btn-edit" data-edit-course="${c.id}" title="Edit">${EDIT_ICON}</button>` : ""}
          <span class="course-chevron">${expandedCourseId === c.id ? "▲" : "▼"}</span>
        </div>
      </div>
      <div id="course-detail-${c.id}" style="${expandedCourseId === c.id ? "" : "display:none;"}padding:0 16px 16px;"></div>
    </div>
  `;
}

function wireCourseRows(container, admin) {
  container.querySelectorAll("[data-toggle-course]").forEach((header) => {
    header.addEventListener("click", async (e) => {
      if (e.target.closest("[data-edit-course]")) return;
      const id = header.dataset.toggleCourse;
      const detailEl = document.getElementById(`course-detail-${id}`);
      if (expandedCourseId === id) {
        expandedCourseId = null;
        detailEl.style.display = "none";
        detailEl.innerHTML = "";
        header.querySelector(".course-chevron").textContent = "▼";
        return;
      }
      if (expandedCourseId) {
        const prevDetail = document.getElementById(`course-detail-${expandedCourseId}`);
        if (prevDetail) { prevDetail.style.display = "none"; prevDetail.innerHTML = ""; }
        const prevHeader = container.querySelector(`[data-toggle-course="${expandedCourseId}"] .course-chevron`);
        if (prevHeader) prevHeader.textContent = "▼";
      }
      expandedCourseId = id;
      detailEl.style.display = "";
      header.querySelector(".course-chevron").textContent = "▲";
      const course = coursesCache.find((c) => c.id === id);
      await renderCourseDetail(detailEl, course);
    });
  });

  if (admin) {
    container.querySelectorAll("[data-edit-course]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const course = coursesCache.find((c) => c.id === btn.dataset.editCourse);
        openCourseModal(course);
      });
    });
  }
}

// ---------- Course detail: video player + tracker + sub-tabs ----------

function extractVideoId(url, provider) {
  if (!url) return null;
  try {
    if (provider === "youtube") {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
      return u.searchParams.get("v") || u.pathname.split("/embed/")[1] || null;
    }
    if (provider === "vimeo") {
      const u = new URL(url);
      const match = u.pathname.match(/(\d+)/);
      return match ? match[1] : null;
    }
  } catch {
    return null;
  }
  return null;
}

function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prevReady) prevReady(); resolve(); };
    if (document.getElementById("youtube-iframe-api")) return;
    const tag = document.createElement("script");
    tag.id = "youtube-iframe-api";
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
}

function loadVimeoAPI() {
  return new Promise((resolve, reject) => {
    if (window.Vimeo && window.Vimeo.Player) return resolve();
    if (document.getElementById("vimeo-player-api")) {
      document.getElementById("vimeo-player-api").addEventListener("load", () => resolve());
      return;
    }
    const tag = document.createElement("script");
    tag.id = "vimeo-player-api";
    tag.src = "https://player.vimeo.com/api/player.js";
    tag.onload = () => resolve();
    tag.onerror = reject;
    document.head.appendChild(tag);
  });
}

let activeCourseTab = "outline";
let progressSaveTimer = null;

async function renderCourseDetail(container, course) {
  activeCourseTab = "outline";
  const p = progressFor(course.id);
  const videoId = extractVideoId(course.video_url, course.video_provider);

  container.innerHTML = `
    <div style="max-width:900px;">
      ${videoId ? `<div id="video-player-${course.id}" style="width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;"></div>` : `<p class="hint">No video configured for this course yet.</p>`}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <p class="hint" id="watch-tracker-${course.id}" style="margin:0;">
          ${p ? `${Math.floor(p.watched_seconds / 60)} min watched (${Math.round(p.watched_percent)}%)` : "Not started yet"}
        </p>
        ${p?.video_completed ? `<span class="status-badge status-completed">Video watched</span>` : ""}
      </div>

      <div class="sub-tab-nav" style="display:flex;gap:4px;border-bottom:1px solid var(--gray-200);margin-top:20px;margin-bottom:16px;">
        <button type="button" class="sub-tab-btn" data-subtab="outline">Course Outline</button>
        <button type="button" class="sub-tab-btn" data-subtab="material">Learning Material</button>
        <button type="button" class="sub-tab-btn" data-subtab="quiz">Quiz</button>
      </div>
      <div id="course-subtab-content-${course.id}"></div>
    </div>
  `;

  container.querySelectorAll(".sub-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCourseTab = btn.dataset.subtab;
      renderCourseSubTab(container, course);
    });
  });
  renderCourseSubTab(container, course);

  if (videoId) initVideoPlayer(course, videoId, p);
}

function renderCourseSubTab(container, course) {
  container.querySelectorAll(".sub-tab-btn").forEach((btn) => {
    const isActive = btn.dataset.subtab === activeCourseTab;
    btn.style.cssText = `padding:8px 14px;border:none;background:none;font-size:13px;cursor:pointer;border-bottom:2px solid ${isActive ? "var(--gray-900)" : "transparent"};font-weight:${isActive ? "600" : "400"};color:${isActive ? "var(--gray-900)" : "var(--gray-500)"};`;
  });
  const wrap = document.getElementById(`course-subtab-content-${course.id}`);
  if (activeCourseTab === "outline") {
    wrap.innerHTML = `<div style="white-space:pre-wrap;">${course.outline || "<span class='hint'>No outline provided yet.</span>"}</div>`;
  } else if (activeCourseTab === "material") {
    wrap.innerHTML = `<div style="white-space:pre-wrap;">${course.learning_material || "<span class='hint'>No learning material provided yet.</span>"}</div>`;
  } else {
    renderQuizTab(wrap, course);
  }
}

async function initVideoPlayer(course, videoId, existingProgress) {
  const targetId = `video-player-${course.id}`;
  const resumeSeconds = existingProgress?.watched_seconds || 0;
  let getCurrentTime = null;
  let getDuration = null;

  const saveProgress = async () => {
    if (!getCurrentTime || !getDuration) return;
    const current = Math.floor(getCurrentTime());
    const duration = Math.floor(getDuration());
    if (!duration) return;
    const { data } = await supabase.rpc("update_video_progress", { p_course_id: course.id, p_watched_seconds: current, p_video_duration_seconds: duration });
    const idx = progressCache.findIndex((pr) => pr.course_id === course.id);
    const percent = Math.min(100, Math.round((current / duration) * 100));
    const updated = { user_id: getIdentity()?.user?.id, course_id: course.id, watched_seconds: current, watched_percent: percent, video_completed: percent >= 90, quiz_passed: idx !== -1 ? progressCache[idx].quiz_passed : false, completed_at: idx !== -1 ? progressCache[idx].completed_at : null, best_quiz_score: idx !== -1 ? progressCache[idx].best_quiz_score : null };
    if (idx !== -1) progressCache[idx] = { ...progressCache[idx], ...updated };
    else progressCache.push(updated);
    const trackerEl = document.getElementById(`watch-tracker-${course.id}`);
    if (trackerEl) trackerEl.textContent = `${Math.floor(current / 60)} min watched (${percent}%)`;
  };

  if (course.video_provider === "youtube") {
    await loadYouTubeAPI();
    // The official way to use the nocookie domain: build the iframe
    // ourselves pointing at youtube-nocookie.com (new YT.Player() with a
    // bare videoId always defaults to youtube.com, with no documented way
    // to override that), then attach the JS API to this existing iframe.
    // origin is included per Google's own docs, as a security measure.
    const target = document.getElementById(targetId);
    const iframe = document.createElement("iframe");
    iframe.id = `${targetId}-iframe`;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`;
    target.appendChild(iframe);

    const player = new window.YT.Player(iframe, {
      events: {
        onReady: (e) => {
          if (resumeSeconds > 0) e.target.seekTo(resumeSeconds, true);
          getCurrentTime = () => e.target.getCurrentTime();
          getDuration = () => e.target.getDuration();
        },
        onStateChange: (e) => {
          if (e.data === window.YT.PlayerState.PLAYING) {
            if (progressSaveTimer) clearInterval(progressSaveTimer);
            progressSaveTimer = setInterval(saveProgress, 10000);
          } else {
            if (progressSaveTimer) clearInterval(progressSaveTimer);
            saveProgress();
          }
        },
        onError: () => {
          if (target) {
            target.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#fff;text-align:center;padding:20px;">
              <p>This video couldn't be played here.</p>
              <a href="${course.video_url}" target="_blank" rel="noopener" style="color:#93c5fd;">Watch it directly on YouTube instead</a>
            </div>`;
          }
        },
      },
    });
  } else if (course.video_provider === "vimeo") {
    await loadVimeoAPI();
    const player = new window.Vimeo.Player(targetId, { id: videoId });
    getCurrentTime = () => player.getCurrentTime();
    getDuration = () => player.getDuration();
    player.ready().then(() => { if (resumeSeconds > 0) player.setCurrentTime(resumeSeconds); });
    player.on("play", () => {
      if (progressSaveTimer) clearInterval(progressSaveTimer);
      progressSaveTimer = setInterval(saveProgress, 10000);
    });
    player.on("pause", () => { if (progressSaveTimer) clearInterval(progressSaveTimer); saveProgress(); });
    player.on("ended", () => { if (progressSaveTimer) clearInterval(progressSaveTimer); saveProgress(); });
  }
}

// ---------- Quiz tab ----------

async function renderQuizTab(wrap, course) {
  wrap.innerHTML = `<p class="hint">Loading quiz...</p>`;
  const { data: questions, error } = await supabase.rpc("get_quiz_questions_for_staff", { p_course_id: course.id });
  if (error || !questions?.length) {
    wrap.innerHTML = `<p class="hint">${error ? "Could not load quiz." : "No quiz configured for this course yet."}</p>`;
    return;
  }

  const p = progressFor(course.id);
  wrap.innerHTML = `
    ${p?.best_quiz_score != null ? `<p class="hint" style="margin-bottom:14px;">Best score so far: <strong>${p.best_quiz_score}%</strong> ${p.quiz_passed ? "— Passed ✓" : "— not yet passed (80% needed)"}</p>` : ""}
    <form id="quiz-form-${course.id}">
      ${questions.map((q, i) => `
        <div style="margin-bottom:20px;">
          <p style="font-weight:600;margin-bottom:8px;">${i + 1}. ${q.question_text}</p>
          ${["a", "b", "c", "d"].map((opt) => `
            <label style="display:block;padding:6px 0;cursor:pointer;">
              <input type="radio" name="q-${q.id}" value="${opt}" required style="margin-right:8px;" />${q[`option_${opt}`]}
            </label>
          `).join("")}
        </div>
      `).join("")}
      <button type="submit" class="btn-dark">Submit Quiz</button>
      <p id="quiz-result-${course.id}" style="margin-top:12px;"></p>
    </form>
  `;

  document.getElementById(`quiz-form-${course.id}`).addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = {};
    questions.forEach((q) => {
      const checked = wrap.querySelector(`input[name="q-${q.id}"]:checked`);
      if (checked) answers[q.id] = checked.value;
    });
    const { data, error: submitError } = await supabase.rpc("submit_quiz_attempt", { p_course_id: course.id, p_answers: answers });
    const resultEl = document.getElementById(`quiz-result-${course.id}`);
    if (submitError) { resultEl.innerHTML = `<span class="form-error">Could not submit: ${submitError.message}</span>`; return; }
    const result = data?.[0];
    const idx = progressCache.findIndex((pr) => pr.course_id === course.id);
    const passed = result?.passed;
    const score = result?.score_percent;
    if (idx !== -1) {
      progressCache[idx].best_quiz_score = Math.max(progressCache[idx].best_quiz_score || 0, score);
      progressCache[idx].quiz_passed = progressCache[idx].quiz_passed || passed;
    } else {
      progressCache.push({ user_id: getIdentity()?.user?.id, course_id: course.id, best_quiz_score: score, quiz_passed: passed, watched_seconds: 0, watched_percent: 0, video_completed: false, completed_at: null });
    }
    resultEl.innerHTML = passed
      ? `<span style="color:#16a34a;font-weight:600;">Passed — ${score}%! 🎉</span>`
      : `<span style="color:#dc2626;font-weight:600;">Scored ${score}% — 80% needed to pass. You can try again.</span>`;
  });
}

// ---------- Admin: category modal ----------

function openCategoryModal() {
  const orgId = getIdentity()?.organisationId;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-card" style="max-width:420px;">
      <div class="modal-header">
        <h2 class="modal-title">Add Category</h2>
        <button type="button" id="modal-close-btn" class="modal-close" aria-label="Close">&times;</button>
      </div>
      <label>Category Name
        <input type="text" id="cat-name" autocomplete="off" />
      </label>
      <p id="cat-error" class="form-error hidden"></p>
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" id="cat-cancel-btn" class="btn-secondary">Cancel</button>
        <button type="button" id="cat-save-btn" class="btn-dark">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector("#modal-close-btn").addEventListener("click", close);
  backdrop.querySelector("#cat-cancel-btn").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector("#cat-save-btn").addEventListener("click", async () => {
    const name = backdrop.querySelector("#cat-name").value.trim();
    const errorEl = backdrop.querySelector("#cat-error");
    if (!name) { errorEl.textContent = "Please enter a category name."; errorEl.classList.remove("hidden"); return; }
    const { error } = await supabase.from("elearn_categories").insert({ organisation_id: orgId, name, sort_order: categoriesCache.length });
    if (error) { errorEl.textContent = "Could not save: " + error.message; errorEl.classList.remove("hidden"); return; }
    close();
    await loadSharedData();
    renderActiveTab();
  });
}

// ---------- Admin: course modal (with quiz builder) ----------

let quizQuestionRows = [];

function blankQuestion() {
  return { id: null, question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "a" };
}

async function openCourseModal(existing) {
  const orgId = getIdentity()?.organisationId;
  const isEdit = !!existing;

  if (isEdit) {
    const { data: existingQuestions } = await supabase.from("elearn_quiz_questions").select("*").eq("course_id", existing.id).order("question_order");
    quizQuestionRows = existingQuestions?.length ? existingQuestions : Array.from({ length: 10 }, blankQuestion);
    while (quizQuestionRows.length < 10) quizQuestionRows.push(blankQuestion());
  } else {
    quizQuestionRows = Array.from({ length: 10 }, blankQuestion);
  }

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal-card" style="max-width:800px;width:95vw;">
      <div class="modal-header">
        <h2 class="modal-title">${isEdit ? "Edit Course" : "Add Course"}</h2>
        <button type="button" id="modal-close-btn" class="modal-close" aria-label="Close">&times;</button>
      </div>

      <label>Title
        <input type="text" id="course-title" value="${existing?.title || ""}" />
      </label>
      <label>Category
        <select id="course-category">
          <option value="">Uncategorised</option>
          ${categoriesCache.map((c) => `<option value="${c.id}" ${existing?.category_id === c.id ? "selected" : ""}>${c.name}</option>`).join("")}
        </select>
      </label>
      <div class="modal-grid">
        <label>Video Provider
          <select id="course-provider">
            <option value="youtube" ${existing?.video_provider === "youtube" ? "selected" : ""}>YouTube</option>
            <option value="vimeo" ${existing?.video_provider === "vimeo" ? "selected" : ""}>Vimeo</option>
          </select>
        </label>
        <label>Duration (minutes)
          <input type="number" id="course-duration" min="1" value="${existing?.duration_minutes || ""}" />
        </label>
      </div>
      <label>Video URL
        <input type="text" id="course-video-url" placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..." value="${existing?.video_url || ""}" />
        <span class="hint">Minute-tracking and resume only work for YouTube or Vimeo links.</span>
      </label>
      <label>Course Outline
        <textarea id="course-outline" rows="3">${existing?.outline || ""}</textarea>
      </label>
      <label>Learning Material
        <textarea id="course-material" rows="4">${existing?.learning_material || ""}</textarea>
      </label>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="course-active" ${existing?.active !== false ? "checked" : ""} style="width:auto;" /> Active (visible to staff)
      </label>

      <h3 style="margin-top:20px;">Quiz — 10 Multiple Choice Questions</h3>
      <p class="hint">Staff need 80% (8 of 10) to pass. Leave a question blank only if you plan to fill it in later.</p>
      <div id="quiz-builder"></div>

      <p id="course-error" class="form-error hidden"></p>
      <div class="modal-actions" style="margin-top:16px;">
        <button type="button" id="course-cancel-btn" class="btn-secondary">Cancel</button>
        ${isEdit ? `<button type="button" id="course-delete-btn" class="btn-secondary" style="color:#dc2626;">Delete Course</button>` : ""}
        <button type="button" id="course-save-btn" class="btn-dark">Save Course</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  renderQuizBuilder(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector("#modal-close-btn").addEventListener("click", close);
  backdrop.querySelector("#course-cancel-btn").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });

  if (isEdit) {
    backdrop.querySelector("#course-delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete "${existing.title}"? This also deletes its quiz questions and all staff progress on it. This cannot be undone.`)) return;
      const { error } = await supabase.from("elearn_courses").delete().eq("id", existing.id);
      if (error) { alert("Could not delete: " + error.message); return; }
      close();
      await loadSharedData();
      renderActiveTab();
    });
  }

  backdrop.querySelector("#course-save-btn").addEventListener("click", async () => {
    const errorEl = backdrop.querySelector("#course-error");
    const title = backdrop.querySelector("#course-title").value.trim();
    const duration = parseInt(backdrop.querySelector("#course-duration").value, 10);
    if (!title) { errorEl.textContent = "Please enter a title."; errorEl.classList.remove("hidden"); return; }
    if (!duration || duration < 1) { errorEl.textContent = "Please enter a valid duration in minutes."; errorEl.classList.remove("hidden"); return; }

    collectQuizBuilderValues(backdrop);
    const filledQuestions = quizQuestionRows.filter((q) => q.question_text.trim());
    if (filledQuestions.length && filledQuestions.length < 10) {
      errorEl.textContent = `All 10 questions must be filled in to have a working quiz (currently ${filledQuestions.length} filled). You can save with 0 filled to add the quiz later, but not partway through.`;
      errorEl.classList.remove("hidden");
      return;
    }
    for (const q of filledQuestions) {
      if (!q.option_a.trim() || !q.option_b.trim() || !q.option_c.trim() || !q.option_d.trim()) {
        errorEl.textContent = "Every question needs all four options filled in.";
        errorEl.classList.remove("hidden");
        return;
      }
    }

    const payload = {
      organisation_id: orgId,
      category_id: backdrop.querySelector("#course-category").value || null,
      title,
      video_provider: backdrop.querySelector("#course-provider").value,
      video_url: backdrop.querySelector("#course-video-url").value.trim() || null,
      duration_minutes: duration,
      outline: backdrop.querySelector("#course-outline").value.trim() || null,
      learning_material: backdrop.querySelector("#course-material").value.trim() || null,
      active: backdrop.querySelector("#course-active").checked,
    };

    let courseId = existing?.id;
    if (isEdit) {
      const { error } = await supabase.from("elearn_courses").update(payload).eq("id", courseId);
      if (error) { errorEl.textContent = "Could not save: " + error.message; errorEl.classList.remove("hidden"); return; }
    } else {
      const { data, error } = await supabase.from("elearn_courses").insert({ ...payload, sort_order: coursesCache.length, created_by: getIdentity()?.user?.id }).select("id").single();
      if (error) { errorEl.textContent = "Could not save: " + error.message; errorEl.classList.remove("hidden"); return; }
      courseId = data.id;
    }

    // Replace quiz questions wholesale - simpler and safer than diffing.
    await supabase.from("elearn_quiz_questions").delete().eq("course_id", courseId);
    if (filledQuestions.length === 10) {
      const { error: qError } = await supabase.from("elearn_quiz_questions").insert(
        filledQuestions.map((q, i) => ({
          course_id: courseId,
          question_order: i + 1,
          question_text: q.question_text.trim(),
          option_a: q.option_a.trim(),
          option_b: q.option_b.trim(),
          option_c: q.option_c.trim(),
          option_d: q.option_d.trim(),
          correct_option: q.correct_option,
        }))
      );
      if (qError) { errorEl.textContent = "Course saved, but the quiz could not be saved: " + qError.message; errorEl.classList.remove("hidden"); return; }
    }

    close();
    await loadSharedData();
    renderActiveTab();
  });
}

function renderQuizBuilder(backdrop) {
  const wrap = backdrop.querySelector("#quiz-builder");
  wrap.innerHTML = quizQuestionRows.map((q, i) => `
    <div style="border:1px solid var(--gray-200);border-radius:8px;padding:12px;margin-bottom:10px;">
      <label>Question ${i + 1}
        <input type="text" class="quiz-q-text" data-idx="${i}" value="${q.question_text || ""}" />
      </label>
      <div class="modal-grid">
        ${["a", "b", "c", "d"].map((opt) => `
          <label>Option ${opt.toUpperCase()}
            <input type="text" class="quiz-q-opt" data-idx="${i}" data-opt="${opt}" value="${q[`option_${opt}`] || ""}" />
          </label>
        `).join("")}
      </div>
      <label style="max-width:200px;">Correct Answer
        <select class="quiz-q-correct" data-idx="${i}">
          ${["a", "b", "c", "d"].map((opt) => `<option value="${opt}" ${q.correct_option === opt ? "selected" : ""}>Option ${opt.toUpperCase()}</option>`).join("")}
        </select>
      </label>
    </div>
  `).join("");
}

function collectQuizBuilderValues(backdrop) {
  backdrop.querySelectorAll(".quiz-q-text").forEach((input) => {
    quizQuestionRows[input.dataset.idx].question_text = input.value;
  });
  backdrop.querySelectorAll(".quiz-q-opt").forEach((input) => {
    quizQuestionRows[input.dataset.idx][`option_${input.dataset.opt}`] = input.value;
  });
  backdrop.querySelectorAll(".quiz-q-correct").forEach((sel) => {
    quizQuestionRows[sel.dataset.idx].correct_option = sel.value;
  });
}

// ---------- Certificate generation ----------

function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf?.jsPDF) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the certificate generator. Check your connection and try again."));
    document.head.appendChild(script);
  });
}

async function generateCertificate(course, progress) {
  try {
    await loadJsPDF();
  } catch (err) {
    alert(err.message);
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const name = getIdentity()?.profile?.display_name || getIdentity()?.profile?.email || "Staff Member";
  const { data: org } = await supabase.from("organisations").select("name").eq("id", getIdentity()?.organisationId).maybeSingle();
  const firmName = org?.name || "";
  const dateStr = progress?.completed_at ? new Date(progress.completed_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";

  doc.setDrawColor(30, 39, 97);
  doc.setLineWidth(1.5);
  doc.rect(8, 8, w - 16, h - 16);
  doc.setLineWidth(0.4);
  doc.rect(11, 11, w - 22, h - 22);

  doc.setFont("times", "bold");
  doc.setFontSize(30);
  doc.setTextColor(30, 39, 97);
  doc.text("Certificate of Completion", w / 2, 45, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(80, 80, 80);
  doc.text("This certifies that", w / 2, 65, { align: "center" });

  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.setTextColor(20, 20, 20);
  doc.text(name, w / 2, 80, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(80, 80, 80);
  doc.text("has successfully completed the course", w / 2, 95, { align: "center" });

  doc.setFont("times", "bold");
  doc.setFontSize(18);
  doc.setTextColor(30, 39, 97);
  doc.text(course.title, w / 2, 108, { align: "center" });

  if (progress?.best_quiz_score != null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Quiz score: ${progress.best_quiz_score}%`, w / 2, 118, { align: "center" });
  }

  doc.setFontSize(11);
  doc.text(dateStr, w / 2, h - 25, { align: "center" });
  if (firmName) doc.text(firmName, w / 2, h - 18, { align: "center" });

  doc.save(`${course.title.replace(/[^a-z0-9]+/gi, "-")}-Certificate.pdf`);
}
