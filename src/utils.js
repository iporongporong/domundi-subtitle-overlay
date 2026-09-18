// 시간 문자열 파싱: "SS" / "MM:SS" / "H:MM:SS" (소수점 초 허용) -> 초 단위 숫자
export function parseTimeToken(tok) {
  if (!tok) return null;
  const parts = tok.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || isNaN(parseFloat(p)))) return null;
  let sec = 0;
  if (parts.length === 1) {
    sec = parseFloat(parts[0]);
  } else if (parts.length === 2) {
    sec = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    sec = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else {
    return null;
  }
  return isNaN(sec) ? null : sec;
}

// "시간 텍스트" 형식의 여러 줄을 파싱 -> [{time, text}], 시간순 정렬
export function parseSubtitleText(raw) {
  const lines = (raw || "").split("\n");
  const result = [];
  let errors = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\S+)\s+(.+)$/);
    if (!m) {
      errors++;
      continue;
    }
    const t = parseTimeToken(m[1]);
    if (t === null) {
      errors++;
      continue;
    }
    result.push({ time: t, text: m[2] });
  }
  result.sort((a, b) => a.time - b.time);
  return { result, errors };
}

export function formatClock(sec) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function slugifyWorkName(name, existingKeys) {
  let slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\uac00-\ud7a3]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) slug = "work-" + Date.now();
  let finalSlug = slug;
  let n = 2;
  while (existingKeys.includes(finalSlug)) {
    finalSlug = slug + "-" + n;
    n++;
  }
  return finalSlug;
}

export function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function safeSet(key, val) {
  try {
    localStorage.setItem(key, val);
  } catch (e) {
    /* ignore */
  }
}
