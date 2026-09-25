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

// SRT 타임코드 한 줄: "00:03:51,829 --> 00:03:53,140" (쉼표/마침표 모두 허용)
const SRT_TIME_RE = /^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;

function parseSrtTimeLine(line) {
  const m = line.trim().match(SRT_TIME_RE);
  if (!m) return null;
  const h = +m[1], mi = +m[2], s = +m[3], ms = +m[4].padEnd(3, "0");
  return h * 3600 + mi * 60 + s + ms / 1000;
}

// "시간 텍스트" 형식, 그리고 SRT 형식(번호 줄 + 타임코드 줄 + 텍스트 줄, 빈 줄로 블록 구분)을
// 함께 인식해서 파싱 -> [{time, text}], 시간순 정렬
export function parseSubtitleText(raw) {
  const blocks = (raw || "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const result = [];
  let errors = 0;

  for (const block of blocks) {
    const blockLines = block.split("\n").map((l) => l.trim()).filter((l) => l !== "");
    if (blockLines.length === 0) continue;

    // 이 블록 안에서 SRT 타임코드 줄을 찾는다 (번호 줄이 있어도 되고 없어도 됨)
    const timeLineIdx = blockLines.findIndex((l) => SRT_TIME_RE.test(l));

    if (timeLineIdx !== -1) {
      const t = parseSrtTimeLine(blockLines[timeLineIdx]);
      const text = blockLines.slice(timeLineIdx + 1).join(" ").trim();
      if (t !== null && text) {
        result.push({ time: t, text });
      } else {
        errors++;
      }
      continue;
    }

    // SRT 형식이 아니면 기존 "시간 텍스트" 한 줄짜리 형식으로 각 줄을 개별 처리
    for (const line of blockLines) {
      const m = line.match(/^(\S+)\s+(.+)$/);
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
