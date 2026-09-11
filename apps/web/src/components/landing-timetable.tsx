import { getInitials } from "@/lib/format";

/**
 * The landing hero.
 *
 * A student's mental model of this product is not "sections" — it is "my Tuesday
 * 2:30 lab". So the hero shows an actual week timetable with two lab blocks lit up
 * and the classmates who are also looking sitting inside them. It explains what the
 * product does without a sentence of marketing, and it is the one place in the
 * design where visual weight is spent.
 *
 * The empty cells are load-bearing: a timetable reads as a timetable because most of
 * it is empty.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

// 08:30 through 16:30, one row per hour. Row 1 is the day header.
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

type Block = {
  code: string;
  component: string;
  day: number;
  endHour: number;
  looking: string[];
  room: string;
  startHour: number;
  time: string;
};

const BLOCKS: Block[] = [
  {
    code: "CHEM 2OA3",
    component: "Lab L02",
    day: 3,
    endHour: 12,
    looking: ["Priya Raman", "Sam Okafor"],
    room: "ABB 165",
    startHour: 9,
    time: "9:30 – 12:20",
  },
  {
    code: "COMPSCI 2C03",
    component: "Lab L03",
    day: 2,
    endHour: 16,
    looking: ["Jordan Lee", "Maya Fitzgerald", "Wei Zhang"],
    room: "ITB 137",
    startHour: 14,
    time: "2:30 – 4:20",
  },
  {
    code: "STATS 2D03",
    component: "Tutorial T05",
    day: 4,
    endHour: 12,
    looking: [],
    room: "JHE 376",
    startHour: 11,
    time: "11:30 – 12:20",
  },
];

function formatHour(hour: number) {
  const suffix = hour < 12 ? "am" : "pm";
  const display = hour > 12 ? hour - 12 : hour;

  return `${display}:30${suffix}`;
}

/**
 * `max` exists because a day column is only ~100px wide: three avatars plus the
 * label does not fit, and the label truncated to "3 lo…". Two avatars and the count
 * do fit, and the count is the part that carries the meaning.
 */
function Classmates({ max = 3, names }: { max?: number; names: string[] }) {
  if (names.length === 0) {
    return null;
  }

  return (
    <span className="mt-auto flex min-w-0 items-center gap-1.5 pt-1.5">
      <span className="flex shrink-0 -space-x-1.5">
        {names.slice(0, max).map((name) => (
          <span
            className="grid size-[18px] place-items-center rounded-full bg-brand text-[8.5px] font-bold text-white ring-2 ring-brand-tint"
            key={name}
          >
            {getInitials(name)}
          </span>
        ))}
      </span>
      <span className="shrink-0 text-[10.5px] font-semibold text-brand">
        {names.length} looking
      </span>
    </span>
  );
}

export function LandingTimetable() {
  return (
    <figure className="m-0">
      {/* Week grid, sm and up. */}
      <div
        className="hidden overflow-hidden rounded-lg border border-rule bg-surface sm:block"
        role="img"
        aria-label="A week timetable showing a CHEM 2OA3 lab on Wednesday morning with 2 classmates looking for a partner, a COMPSCI 2C03 lab on Tuesday afternoon with 3 looking, and a STATS 2D03 tutorial on Thursday."
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: "56px repeat(5, minmax(0, 1fr))",
            gridTemplateRows: `34px repeat(${HOURS.length}, 52px)`,
          }}
        >
          {/* Day header */}
          <div className="border-b border-rule bg-paper" style={{ gridColumn: 1, gridRow: 1 }} />
          {DAYS.map((day, index) => (
            <div
              className="flex items-center border-b border-l border-rule bg-paper px-3 text-[12px] font-bold uppercase tracking-wide text-muted"
              key={day}
              style={{ gridColumn: index + 2, gridRow: 1 }}
            >
              {day}
            </div>
          ))}

          {/* Time rail + empty cells */}
          {HOURS.map((hour, rowIndex) => (
            <div
              className="tnum flex items-start justify-end border-b border-rule pr-2 pt-1 text-[11px] text-muted/80"
              key={hour}
              style={{ gridColumn: 1, gridRow: rowIndex + 2 }}
            >
              {formatHour(hour)}
            </div>
          ))}
          {HOURS.map((hour, rowIndex) =>
            DAYS.map((day, colIndex) => (
              <div
                className="border-b border-l border-rule"
                key={`${day}-${hour}`}
                style={{ gridColumn: colIndex + 2, gridRow: rowIndex + 2 }}
              />
            )),
          )}

          {/* Blocks. Row 1 is the day header and HOURS[0] (08:30) is row 2, so an
              hour maps to `hour - 6`. */}
          {BLOCKS.map((block) => {
            const isLab = block.looking.length > 0;
            const span = block.endHour - block.startHour;

            return (
              <div
                className={`m-[3px] flex flex-col overflow-hidden rounded px-2.5 py-1.5 ${
                  isLab ? "bg-brand-tint ring-1 ring-brand/25" : "bg-paper ring-1 ring-rule-strong"
                }`}
                key={block.code}
                style={{
                  gridColumn: block.day + 1,
                  gridRow: `${block.startHour - 6} / ${block.endHour - 6}`,
                }}
              >
                <span
                  className={`truncate text-[12px] font-bold leading-[1.25] ${
                    isLab ? "text-brand" : "text-ink-soft"
                  }`}
                >
                  {block.code}
                </span>
                <span className="truncate text-[11px] leading-[1.3] text-muted">
                  {block.component}
                </span>
                {/* Only a block tall enough to hold it gets the time and room. */}
                {span >= 3 ? (
                  <span className="tnum truncate text-[10.5px] leading-[1.4] text-muted">
                    {block.room}
                  </span>
                ) : null}
                {span >= 2 ? <Classmates max={2} names={block.looking} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Same information as a time-railed list on phones, where a five-column grid
          would be unreadable. */}
      <ul className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:hidden">
        {BLOCKS.map((block) => (
          <li className="flex gap-3 bg-surface px-3 py-3" key={block.code}>
            <div className="tnum w-[58px] shrink-0 pt-0.5 text-right">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
                {DAYS[block.day - 1]}
              </p>
              <p className="text-[11px] leading-tight text-muted/80">{block.time}</p>
            </div>
            <div
              className={`min-w-0 flex-1 rounded px-2.5 py-2 ${
                block.looking.length > 0
                  ? "bg-brand-tint ring-1 ring-brand/25"
                  : "bg-paper ring-1 ring-rule-strong"
              }`}
            >
              <p
                className={`text-[13px] font-bold leading-tight ${
                  block.looking.length > 0 ? "text-brand" : "text-ink-soft"
                }`}
              >
                {block.code}
              </p>
              <p className="text-[11.5px] leading-tight text-muted">
                {block.component} · {block.room}
              </p>
              <Classmates names={block.looking} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
