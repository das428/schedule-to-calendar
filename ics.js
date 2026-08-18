// Builds an RFC5545-compliant .ics string from parsed course data.

const VTIMEZONE_NY = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
TZOFFSETTO:-0400
TZNAME:EDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
TZOFFSETTO:-0500
TZNAME:EST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE`;

function to24Hour(timeStr) {
  // "10:45AM" -> "1045"
  const [, h1, m1, ampm] = timeStr.match(/(\d{1,2}):(\d{2})(AM|PM)/);
  let h = Number(h1);
  const m = Number(m1);
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return String(h).padStart(2, "0") + String(m).padStart(2, "0") + "00";
}

function mdyToParts(mdy) {
  // "08/25/2026" -> { y: "2026", m: "08", d: "25" }
  const [m, d, y] = mdy.split("/");
  return { y, m, d };
}

const ICS_DAY_TO_JS_DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// A term's dateStart is just the first day of the term's start week, not
// necessarily a day the class meets on (e.g. term starts Monday 8/24 but
// this section only meets Tue/Thu). Roll forward to the first date on or
// after dateStart that actually falls on one of the meeting's days, so
// that isn't a bogus one-off event stacked on top of every other course.
function firstOccurrence(mdy, days) {
  const { y, m, d } = mdyToParts(mdy);
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const wantedDays = days.map((code) => ICS_DAY_TO_JS_DAY[code]);
  while (!wantedDays.includes(date.getDay())) {
    date.setDate(date.getDate() + 1);
  }
  return {
    y: String(date.getFullYear()),
    m: String(date.getMonth() + 1).padStart(2, "0"),
    d: String(date.getDate()).padStart(2, "0"),
  };
}

function buildIcs(courses) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Banner to Cal//EN",
    "CALSCALE:GREGORIAN",
    VTIMEZONE_NY,
  ];

  courses.forEach((course) => {
    course.meetings.forEach((m, idx) => {
      const isSingleDay = m.dateStart === m.dateEnd;
      const start = isSingleDay
        ? mdyToParts(m.dateStart)
        : firstOccurrence(m.dateStart, m.days);
      const end = mdyToParts(m.dateEnd);
      const uid = `${course.subj}${course.num}-${course.sec}-${idx}-${course.crn}@banner-to-cal`;
      const summarySuffix = isSingleDay ? " - Common Hour Exam" : "";

      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `SUMMARY:${course.subj}${course.num} ${course.title}${summarySuffix}`,
        `DTSTART;TZID=America/New_York:${start.y}${start.m}${start.d}T${to24Hour(m.timeStart)}`,
        `DTEND;TZID=America/New_York:${start.y}${start.m}${start.d}T${to24Hour(m.timeEnd)}`
      );

      if (!isSingleDay) {
        lines.push(
          `RRULE:FREQ=WEEKLY;BYDAY=${m.days.join(",")};UNTIL=${end.y}${end.m}${end.d}T235959Z`
        );
      }

      lines.push(
        `LOCATION:${(m.location || "TBD").replace(/,/g, "\\,")}`,
        `DESCRIPTION:CRN ${course.crn}\\nSection: ${course.subj} ${course.num}-${course.sec}\\nInstructor: ${m.instructor || "TBD"}`,
        // Explicitly override the destination calendar's default reminder —
        // otherwise apps like Google Calendar apply their own 10-min-before
        // notification to every imported event that has no VALARM of its own.
        "BEGIN:VALARM",
        "ACTION:NONE",
        "TRIGGER:PT0S",
        "END:VALARM",
        "END:VEVENT"
      );
    });
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
