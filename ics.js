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
  // "10:45 AM" -> "1045"
  const [time, ampm] = timeStr.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return String(h).padStart(2, "0") + String(m).padStart(2, "0") + "00";
}

function mdyToParts(mdy) {
  // "08/25/2026" -> { y: "2026", m: "08", d: "25" }
  const [m, d, y] = mdy.split("/");
  return { y, m, d };
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
      const start = mdyToParts(m.dateStart);
      const end = mdyToParts(m.dateEnd);
      const isSingleDay = m.dateStart === m.dateEnd;
      const uid = `${course.subj}${course.num}-${course.sec}-${idx}-${course.crn}@banner-to-cal`;
      const summarySuffix = isSingleDay ? " - Common Hour Exam" : "";

      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `SUMMARY:${course.title} (${course.subj} ${course.num}-${course.sec})${summarySuffix}`,
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
        `DESCRIPTION:CRN ${course.crn}\\nInstructor: ${m.instructor || "TBD"}`,
        "END:VEVENT"
      );
    });
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
