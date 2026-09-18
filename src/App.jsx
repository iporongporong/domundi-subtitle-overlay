import { useCallback, useEffect, useRef, useState } from "react";
import { ref, onValue, get, set } from "firebase/database";
import { db } from "./firebase";
import { parseTimeToken, parseSubtitleText, formatClock, slugifyWorkName, safeGet, safeSet } from "./utils";
import {
  IconPlay, IconPause, IconRewind, IconGear, IconExpand, IconCompact,
  IconClose, IconLock, IconLockClosed, IconChevron, IconSkipBack, IconSkipFwd,
} from "./Icons";

const FONT_SIZE_DEFAULT = 26;
const FONT_SIZE_MIN = 16;
const FONT_SIZE_MAX = 40;
const BLOG_URL = "https://blog.naver.com/boyslog";

export default function App() {
  // ---- 자막 라이브러리 (Firebase Realtime Database) ----
  const [library, setLibrary] = useState({});
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [currentWork, setCurrentWork] = useState(null);
  const [currentEp, setCurrentEp] = useState(null);
  const [subtitles, setSubtitles] = useState([]);

  // ---- 재생 상태 ----
  const [isPlaying, setIsPlaying] = useState(false);
  const [clockText, setClockText] = useState("00:00");
  const [displayedSubtitle, setDisplayedSubtitle] = useState(null);
  const [resetActive, setResetActive] = useState(false);
  const isPlayingRef = useRef(false);
  const startEpochRef = useRef(null);
  const elapsedAtStartRef = useRef(0);
  const rafRef = useRef(null);
  const subtitlesRef = useRef([]);
  const offsetRef = useRef(0);

  // ---- 개인 설정 (이 브라우저에만 저장) ----
  const [offsetSec, setOffsetSecState] = useState(() => {
    const s = safeGet("subOverlay_offset");
    return s !== null ? parseFloat(s) || 0 : 0;
  });
  const [fontSize, setFontSizeState] = useState(() => {
    const s = safeGet("subOverlay_fontsize");
    return s !== null ? parseInt(s, 10) : FONT_SIZE_DEFAULT;
  });
  const [compact, setCompact] = useState(() => safeGet("subOverlay_compact") === "1");
  const [controlsVisible, setControlsVisible] = useState(false);

  // ---- UI 토글 ----
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [modalView, setModalView] = useState("locked"); // 'locked' | 'unlocked'
  const [pinInput, setPinInput] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [pinHint, setPinHint] = useState("");
  const [subtitleInput, setSubtitleInput] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [newWorkName, setNewWorkName] = useState("");
  const [newEpNum, setNewEpNum] = useState("");

  const jumpInputRef = useRef(null);
  const miniJumpInputRef = useRef(null);

  // ================= Firebase: 라이브러리 실시간 구독 =================
  useEffect(() => {
    const libRef = ref(db, "subtitleOverlay/library");
    const unsub = onValue(libRef, (snap) => {
      setLibrary(snap.val() || {});
      setLibraryLoaded(true);
    });
    return () => unsub();
  }, []);

  // ================= 초기 작품/회차 결정 (URL 파라미터 반영) =================
  useEffect(() => {
    if (!libraryLoaded || currentWork !== null) return;
    const keys = Object.keys(library);
    if (keys.length === 0) {
      setCurrentWork("");
      setCurrentEp("");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const wParam = params.get("work");
    const w = wParam && library[wParam] ? wParam : keys[0];
    const epKeys = Object.keys(library[w]?.episodes || {});
    const eParam = params.get("ep");
    const e = eParam && epKeys.includes(eParam) ? eParam : epKeys[0] || "";
    setCurrentWork(w);
    setCurrentEp(e);
  }, [libraryLoaded, library, currentWork]);

  // URL 동기화
  useEffect(() => {
    if (!currentWork) return;
    const url = `${window.location.pathname}?work=${encodeURIComponent(currentWork)}&ep=${encodeURIComponent(currentEp)}`;
    window.history.replaceState(null, "", url);
  }, [currentWork, currentEp]);

  // 자막 데이터 파싱 (라이브러리 또는 선택된 회차가 바뀔 때)
  useEffect(() => {
    if (!currentWork) return;
    const raw = library[currentWork]?.episodes?.[currentEp] || "";
    const { result } = parseSubtitleText(raw);
    setSubtitles(result);
  }, [library, currentWork, currentEp]);

  useEffect(() => {
    subtitlesRef.current = subtitles;
    updateDisplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitles]);

  useEffect(() => {
    offsetRef.current = offsetSec;
    safeSet("subOverlay_offset", String(offsetSec));
    updateDisplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsetSec]);

  // 관리자 모달이 열려있는 동안 회차를 바꾸면 편집창도 갱신
  useEffect(() => {
    if (adminOpen && modalView === "unlocked") {
      setSubtitleInput(library[currentWork]?.episodes?.[currentEp] || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWork, currentEp, adminOpen, modalView]);

  // ================= 재생 로직 =================
  function getCurrentTime() {
    if (isPlayingRef.current && startEpochRef.current !== null) {
      return elapsedAtStartRef.current + (performance.now() - startEpochRef.current) / 1000;
    }
    return elapsedAtStartRef.current;
  }

  const updateDisplay = useCallback(() => {
    const t = getCurrentTime();
    setClockText(formatClock(t));
    let current = null;
    for (let i = 0; i < subtitlesRef.current.length; i++) {
      const adjTime = subtitlesRef.current[i].time + offsetRef.current;
      if (adjTime <= t) current = subtitlesRef.current[i];
      else break;
    }
    setDisplayedSubtitle(current ? current.text : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tick() {
    updateDisplay();
    if (isPlayingRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }

  function clearResetActive() {
    setResetActive(false);
  }

  function togglePlay() {
    if (isPlayingRef.current) {
      elapsedAtStartRef.current = getCurrentTime();
      isPlayingRef.current = false;
      startEpochRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setIsPlaying(false);
    } else {
      clearResetActive();
      startEpochRef.current = performance.now();
      isPlayingRef.current = true;
      setIsPlaying(true);
      tick();
    }
  }

  function resetClock() {
    isPlayingRef.current = false;
    startEpochRef.current = null;
    elapsedAtStartRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setResetActive(true);
    updateDisplay();
  }

  function jumpToPrevSub() {
    if (!subtitlesRef.current.length) return;
    clearResetActive();
    const t = getCurrentTime();
    const times = subtitlesRef.current.map((s) => s.time + offsetRef.current);
    let target = null;
    for (let i = times.length - 1; i >= 0; i--) {
      if (times[i] < t - 0.5) { target = times[i]; break; }
    }
    elapsedAtStartRef.current = Math.max(0, target !== null ? target : 0);
    if (isPlayingRef.current) startEpochRef.current = performance.now();
    updateDisplay();
  }

  function jumpToNextSub() {
    if (!subtitlesRef.current.length) return;
    clearResetActive();
    const t = getCurrentTime();
    const times = subtitlesRef.current.map((s) => s.time + offsetRef.current);
    const target = times.find((time) => time > t + 0.01);
    if (target === undefined) return;
    elapsedAtStartRef.current = target;
    if (isPlayingRef.current) startEpochRef.current = performance.now();
    updateDisplay();
  }

  function jumpToTime(val) {
    const t = parseTimeToken((val || "").trim());
    if (t === null) return;
    clearResetActive();
    elapsedAtStartRef.current = t;
    if (isPlayingRef.current) startEpochRef.current = performance.now();
    updateDisplay();
  }

  function nudge(delta) {
    clearResetActive();
    elapsedAtStartRef.current = Math.max(0, getCurrentTime() + delta);
    if (isPlayingRef.current) startEpochRef.current = performance.now();
    updateDisplay();
  }

  // ================= 작품 / 회차 전환 =================
  function switchEpisode(work, ep) {
    setCurrentWork(work);
    setCurrentEp(ep);
    isPlayingRef.current = false;
    startEpochRef.current = null;
    elapsedAtStartRef.current = 0;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
    setResetActive(true);
  }

  function mergedWorkKeys() {
    return Object.keys(library);
  }
  function workLabel(work) {
    return library[work]?.label || work;
  }
  function episodesKeys(work) {
    return Object.keys(library[work]?.episodes || {}).sort((a, b) => parseFloat(a) - parseFloat(b));
  }
  function hasContent(work, ep) {
    const raw = library[work]?.episodes?.[ep];
    return !!(raw && raw.trim().length > 0);
  }
  function workHasAnyContent(work) {
    return episodesKeys(work).some((ep) => hasContent(work, ep));
  }

  function visibleWorkKeys() {
    return mergedWorkKeys().filter((k) => adminUnlocked || workHasAnyContent(k) || k === currentWork);
  }
  function visibleEpKeys(work) {
    return episodesKeys(work).filter((ep) => adminUnlocked || hasContent(work, ep) || ep === currentEp);
  }

  function onWorkChange(e) {
    const work = e.target.value;
    const firstEp = episodesKeys(work)[0] || "";
    switchEpisode(work, firstEp);
  }
  function onEpChange(e) {
    switchEpisode(currentWork, e.target.value);
  }
  function resetToDefault() {
    const keys = mergedWorkKeys();
    if (!keys.length) return;
    const firstWork = keys[0];
    const firstEp = episodesKeys(firstWork)[0] || "";
    switchEpisode(firstWork, firstEp);
  }

  // ================= 관리자 =================
  function toggleAdmin() {
    const willOpen = !adminOpen;
    setAdminOpen(willOpen);
    if (willOpen) {
      setModalView("locked");
      setPinInput("");
      setPinMsg("");
      get(ref(db, "subtitleOverlay/meta/pin")).then((snap) => {
        setPinHint(
          snap.exists()
            ? ""
            : "아직 PIN이 설정되지 않았습니다. 원하는 숫자를 입력하면 그게 앞으로의 관리자 PIN으로 등록됩니다."
        );
      });
    }
  }

  async function submitPin() {
    const entered = pinInput.trim();
    if (!entered) return;
    const snap = await get(ref(db, "subtitleOverlay/meta/pin"));
    if (!snap.exists()) {
      await set(ref(db, "subtitleOverlay/meta/pin"), entered);
      unlockAdmin();
      return;
    }
    if (entered === snap.val()) {
      unlockAdmin();
    } else {
      setPinMsg("PIN이 일치하지 않습니다.");
    }
  }

  function unlockAdmin() {
    setModalView("unlocked");
    setAdminUnlocked(true);
    setSubtitleInput(library[currentWork]?.episodes?.[currentEp] || "");
  }

  function lockAdmin() {
    setAdminOpen(false);
    setAdminUnlocked(false);
  }

  async function saveSubtitles() {
    const { result, errors } = parseSubtitleText(subtitleInput);
    await set(ref(db, `subtitleOverlay/library/${currentWork}/episodes/${currentEp}`), subtitleInput);
    setSaveStatus(
      `저장됨 (${workLabel(currentWork)} ${currentEp}화) · ${result.length}개 자막` +
        (errors ? ` (인식 실패 ${errors}줄)` : "")
    );
  }

  async function addNewWork() {
    const label = newWorkName.trim();
    if (!label) return;
    const key = slugifyWorkName(label, mergedWorkKeys());
    await set(ref(db, `subtitleOverlay/library/${key}`), { label, episodes: { "1": "" } });
    setNewWorkName("");
    switchEpisode(key, "1");
  }

  async function addNewEpisode() {
    const ep = newEpNum.trim();
    if (!ep) return;
    if (!episodesKeys(currentWork).includes(ep)) {
      await set(ref(db, `subtitleOverlay/library/${currentWork}/episodes/${ep}`), "");
    }
    setNewEpNum("");
    switchEpisode(currentWork, ep);
  }

  // ================= 폰트 크기 =================
  function adjustFontSize(delta) {
    const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, fontSize + delta));
    setFontSizeState(next);
    safeSet("subOverlay_fontsize", String(next));
  }
  function resetFontSize() {
    setFontSizeState(FONT_SIZE_DEFAULT);
    safeSet("subOverlay_fontsize", String(FONT_SIZE_DEFAULT));
  }

  // ================= 컴팩트 모드 / body 클래스 =================
  useEffect(() => {
    document.body.classList.toggle("compact", compact);
    safeSet("subOverlay_compact", compact ? "1" : "0");
  }, [compact]);

  useEffect(() => {
    document.body.classList.toggle("controls-visible", controlsVisible);
  }, [controlsVisible]);

  const hideTimerRef = useRef(null);
  const showCompactControls = useCallback(() => {
    if (!document.body.classList.contains("compact")) return;
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 6000);
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", showCompactControls);
    document.addEventListener("touchstart", showCompactControls);
    return () => {
      document.removeEventListener("mousemove", showCompactControls);
      document.removeEventListener("touchstart", showCompactControls);
      clearTimeout(hideTimerRef.current);
    };
  }, [showCompactControls]);

  // ================= 키보드 단축키 =================
  useEffect(() => {
    function onKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "ArrowRight") nudge(e.shiftKey ? 5 : 1);
      else if (e.code === "ArrowLeft") nudge(e.shiftKey ? -5 : -1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================= 렌더링 =================
  if (!libraryLoaded || currentWork === null) {
    return (
      <div className="wrap">
        <div className="hint" style={{ padding: 24, textAlign: "center" }}>불러오는 중...</div>
      </div>
    );
  }

  const hasAnyWork = mergedWorkKeys().length > 0;

  return (
    <div className="wrap">
      <h1 style={{ justifyContent: "space-between" }}>
        <span>Domundi 시리즈 한글 자막</span>
        <button className="header-icon-btn" onClick={toggleAdmin} title="관리자">
          {adminUnlocked ? <IconLock size={22} /> : <IconLockClosed size={22} />}
        </button>
      </h1>

      <a className="blog-banner" href={BLOG_URL} target="_blank" rel="noopener noreferrer">
        <span>DMD Late Check-In 블로그 바로가기</span>
        <IconExpand size={18} />
      </a>

      {hasAnyWork && (
        <div className="panel compact-hide" style={{ padding: "10px 14px" }}>
          <div className="row">
            <select value={currentWork} onChange={onWorkChange} style={{ flex: 1, minWidth: 140 }}>
              {visibleWorkKeys().map((k) => (
                <option key={k} value={k}>{workLabel(k)}</option>
              ))}
            </select>
            <select value={currentEp} onChange={onEpChange} style={{ width: 90 }}>
              {visibleEpKeys(currentWork).map((ep) => (
                <option key={ep} value={ep}>
                  {ep}화{adminUnlocked && !hasContent(currentWork, ep) ? " (미등록)" : ""}
                </option>
              ))}
            </select>
            <button className="icon-square" onClick={resetToDefault} title="선택 초기화">
              <IconClose size={14} />
            </button>
          </div>
        </div>
      )}

      {!hasAnyWork && (
        <div className="panel compact-hide">
          <div className="hint">아직 등록된 자막이 없습니다.</div>
        </div>
      )}

      {/* 자막 표시 영역 */}
      <div className="panel overlay-panel" style={{ padding: 0 }}>
        <div className="overlay-box">
          <div className="overlay-stage">
            <div className="subtitle-text" style={{ fontSize: `${fontSize}px` }}>
              {displayedSubtitle ? displayedSubtitle : <span className="subtitle-placeholder">여기에 자막이 표시됩니다</span>}
            </div>
          </div>
          <div className="mini-bar">
            <div className="mini-row">
              <button className="icon-only" onClick={togglePlay} title="재생/정지">
                {isPlaying ? <IconPause size={12} /> : <IconPlay size={12} />}
              </button>
              <span className="mini-clock">{clockText}</span>
              <input ref={miniJumpInputRef} type="text" className="mini-jump-input" placeholder="00:00:00"
                onKeyDown={(e) => { if (e.key === "Enter") { jumpToTime(miniJumpInputRef.current.value); miniJumpInputRef.current.value = ""; miniJumpInputRef.current.blur(); } }} />
              <button className="mini-go-btn" onClick={() => { jumpToTime(miniJumpInputRef.current.value); miniJumpInputRef.current.value = ""; }} title="입력한 시간으로 이동">이동</button>
            </div>
            <div className="mini-row mini-row-nav">
              <button className={"sync-toggle-btn" + (settingsOpen ? " btn-active" : "")} onClick={() => setSettingsOpen((v) => !v)} title="자막 싱크">
                <IconGear size={13} /> 자막 싱크
              </button>
              <button onClick={() => setCompact(false)} title="전체 보기"><IconExpand size={12} /> 전체 보기</button>
            </div>
          </div>
        </div>

        <div style={{ padding: "10px 14px" }} className="compact-hide">
          <div className="row">
            <button className="primary" onClick={togglePlay} style={{ minWidth: 106, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {isPlaying ? <IconPause style={{ verticalAlign: "-2px", marginRight: 5 }} /> : <IconPlay style={{ verticalAlign: "-2px", marginRight: 5 }} />}
              <span>{isPlaying ? "일시정지" : "재생"}</span>
            </button>
            <button className={resetActive ? "btn-active" : ""} onClick={resetClock}>
              <IconRewind style={{ verticalAlign: "-2px", marginRight: 4 }} />처음으로
            </button>
            <span className="clock">{clockText}</span>
          </div>
          <button className="primary compact-cta" onClick={() => { setSettingsOpen(false); setCompact(true); }}>
            <IconCompact style={{ verticalAlign: "-3px", marginRight: 6 }} />컴팩트 모드로 보기
          </button>
          <button className={"sync-toggle-btn link-cta" + (settingsOpen ? " btn-active" : "")} onClick={() => setSettingsOpen((v) => !v)}>
            <IconGear style={{ verticalAlign: "-2px", marginRight: 5 }} />자막 싱크
          </button>
        </div>
      </div>

      {/* 설정: 재생 위치 점프
