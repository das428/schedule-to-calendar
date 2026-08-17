// Parses raw text extracted from a Banner "print schedule" PDF into a
// structured list of courses, each with one or more meeting blocks
// (a course can have multiple blocks — e.g. weekly class + a one-off
// common hour exam date).
// Builds an array of course objects.

const DAY_MAP = {
  Monday: "MO", Tuesday: "TU", Wednesday: "WE",
  Thursday: "TH", Friday: "FR", Saturday: "SA", Sunday: "SU",
};
const DAY_NAMES = Object.keys(DAY_MAP);

// e.g. "Linear Methods MATH 205 012 3.0 40127 08/24/2026 - 12/04/2026"
const HEADER_RE = new RegExp(
  "^(.+?)\\s+([A-Z]{2,4})\\s+(\\d{3})\\s+(\\d{3})\\s+" +
  "(\\d+\\.\\d)\\s+(\\d{5})\\s+" +
  "(\\d{2}/\\d{2}/\\d{4})\\s*[-–—]\\s*(\\d{2}/\\d{2}/\\d{4})"
);

const DATE_RANGE_RE = /^(\d{2}\/\d{2}\/\d{4})\s*[-–—]\s*(\d{2}\/\d{2}\/\d{4})$/;
const TIME_RE = /^(\d{1,2}\s*:\s*\d{2}\s*[AP]M)\s*[-–—]\s*(\d{1,2}\s*:\s*\d{2}\s*[AP]M)$/;
const DAYS_LINE_RE = new RegExp(
  "^(" + DAY_NAMES.join("|") + ")(,\\s*(" + DAY_NAMES.join("|") + "))*$"
);
const INSTRUCTOR_RE = /^([A-Za-z\-.]+),\s*([A-Za-z\-. ]+)$/;
const LOCATION_HINT = "Campus,"; // Banner location lines contain "<Campus name> Campus, <bldg>, <room>"

// Rebuilds a time string into a strict "H:MM AM" format regardless of
// how many/where stray spaces landed around the colon or AM/PM in the
// original PDF text extraction.
function normalizeTime(str) {
  const m = str.match(/(\d{1,2})\s*:\s*(\d{2})\s*([AP]M)/i);
  return `${m[1]}:${m[2]} ${m[3].toUpperCase()}`;
}

function parseCourses(fullText) {
  const lines = fullText.split("\n").map((l) => l.trim()).filter(Boolean);
  const courses = [];
  let current = null;

  for (const line of lines) {
    const header = line.match(HEADER_RE);
    if (header) {
      if (current) courses.push(current);
      current = {
        title: header[1].trim(),
        subj: header[2],
        num: header[3],
        sec: header[4],
        credits: header[5],
        crn: header[6],
        meetings: [{ dateStart: header[7], dateEnd: header[8] }],
      };
      continue;
    }

    const dateRange = line.match(DATE_RANGE_RE);
    if (dateRange && current) {
      current.meetings.push({ dateStart: dateRange[1], dateEnd: dateRange[2] });
      continue;
    }

    if (current && current.meetings.length && DAYS_LINE_RE.test(line)) {
      current.meetings.at(-1).days = line.split(",").map((d) => DAY_MAP[d.trim()]);
      continue;
    }

    const time = line.match(TIME_RE);
    if (time && current && current.meetings.length) {
      const m = current.meetings.at(-1);
      m.timeStart = normalizeTime(time[1]);
      m.timeEnd = normalizeTime(time[2]);
      continue;
    }

    if (current && current.meetings.length && line.includes(LOCATION_HINT)) {
      current.meetings.at(-1).location = line;
      continue;
    }

    const instr = line.match(INSTRUCTOR_RE);
    if (
      instr && current && current.meetings.length &&
      current.meetings.at(-1).location && !current.meetings.at(-1).instructor
    ) {
      current.meetings.at(-1).instructor = line;
      continue;
    }
  }

  if (current) courses.push(current);

  // Only keep meetings that actually got a day + time attached —
  // filters out stray lines that matched nothing useful.
  for (const c of courses) {
    c.meetings = c.meetings.filter((m) => m.days && m.timeStart);
  }
  return courses.filter((c) => c.meetings.length > 0);
}
