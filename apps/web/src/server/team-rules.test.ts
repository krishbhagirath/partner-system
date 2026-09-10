import { describe, expect, it } from "vitest";

import { buildSectionDiscoveryKey } from "@/server/section-key";
import {
  formatTeamNoun,
  isRenderableTeam,
  pickTeamContact,
  resolveJoinPlan,
  shapeDiscoveryEntry,
  type TeamState,
} from "@/server/team-rules";

const SENDER = "user-sender";
const RECEIVER = "user-receiver";

function team(teamId: string, isComplete: boolean, memberUserIds = [SENDER, "other"]): TeamState {
  return { isComplete, memberUserIds, teamId };
}

describe("buildSectionDiscoveryKey", () => {
  // This string is stored in Team.sectionKey and TeamMember.sectionKey, and the
  // unique index on (userId, sectionKey) is what enforces one team per student per
  // section. Reformatting it would not error — it would orphan every existing team.
  it("produces the exact persisted format", () => {
    expect(
      buildSectionDiscoveryKey({
        componentType: "LAB",
        courseCode: "COMPSCI 2C03",
        dayOfWeek: "MONDAY",
        endTime: new Date("1970-01-01T17:20:00.000Z"),
        sectionCode: "L01",
        startTime: new Date("1970-01-01T14:30:00.000Z"),
        term: "2026 Fall",
      }),
    ).toBe(
      "2026 Fall::COMPSCI 2C03::LAB::L01::MONDAY::1970-01-01T14:30:00.000Z::1970-01-01T17:20:00.000Z",
    );
  });

  it("separates sections that differ only by time", () => {
    const base = {
      componentType: "LAB",
      courseCode: "COMPSCI 2C03",
      dayOfWeek: "MONDAY",
      endTime: new Date("1970-01-01T17:20:00.000Z"),
      sectionCode: "L01",
      term: "2026 Fall",
    } as const;

    expect(
      buildSectionDiscoveryKey({ ...base, startTime: new Date("1970-01-01T14:30:00.000Z") }),
    ).not.toBe(
      buildSectionDiscoveryKey({ ...base, startTime: new Date("1970-01-01T15:30:00.000Z") }),
    );
  });
});

describe("resolveJoinPlan", () => {
  it("creates a team when neither side has one", () => {
    expect(
      resolveJoinPlan({
        receiverId: RECEIVER,
        receiverTeam: null,
        senderId: SENDER,
        senderTeam: null,
      }),
    ).toEqual({ kind: "create-team" });
  });

  it("puts the sender into the receiver's open team", () => {
    expect(
      resolveJoinPlan({
        receiverId: RECEIVER,
        receiverTeam: team("team-r", false),
        senderId: SENDER,
        senderTeam: null,
      }),
    ).toEqual({ joinerId: SENDER, kind: "join-team", teamId: "team-r" });
  });

  it("puts the receiver into the sender's open team when only the sender is recruiting", () => {
    expect(
      resolveJoinPlan({
        receiverId: RECEIVER,
        receiverTeam: null,
        senderId: SENDER,
        senderTeam: team("team-s", false),
      }),
    ).toEqual({ joinerId: RECEIVER, kind: "join-team", teamId: "team-s" });
  });

  const conflicts: Array<[string, TeamState, TeamState, string]> = [
    [
      "receiver's team is complete",
      null,
      team("team-r", true),
      "This student's team for this section is already complete.",
    ],
    [
      "sender's team is complete",
      team("team-s", true),
      null,
      "Your team for this section is complete. Mark it as looking for more people first.",
    ],
    [
      "both sides already have teams",
      team("team-s", false),
      team("team-r", false),
      "You both already have teams for this section. Leave yours first.",
    ],
    [
      "sender complete takes priority over receiver complete",
      team("team-s", true),
      team("team-r", true),
      "Your team for this section is complete. Mark it as looking for more people first.",
    ],
  ];

  it.each(conflicts)("409s when %s", (_label, senderTeam, receiverTeam, message) => {
    expect(
      resolveJoinPlan({ receiverId: RECEIVER, receiverTeam, senderId: SENDER, senderTeam }),
    ).toEqual({ kind: "conflict", message, statusCode: 409 });
  });

  it("reports already-teammates rather than a generic conflict", () => {
    const shared = team("team-shared", false, [SENDER, RECEIVER]);

    expect(
      resolveJoinPlan({
        receiverId: RECEIVER,
        receiverTeam: shared,
        senderId: SENDER,
        senderTeam: shared,
      }),
    ).toEqual({
      kind: "conflict",
      message: "You are already on a team with this student for this section.",
      statusCode: 409,
    });
  });
});

describe("shapeDiscoveryEntry", () => {
  const candidates = [{ userId: "solo-1" }, { userId: "solo-2" }, { userId: "teamed-1" }];
  const openTeams = [
    { memberUserIds: ["teamed-1", "teamed-2"], teamId: "team-open" },
    { memberUserIds: ["lonely"], teamId: "team-undersized" },
  ];
  const teamedUserIds = new Set(["teamed-1", "teamed-2"]);

  function shape(viewerTeam: TeamState, teamsEnabled = true) {
    return shapeDiscoveryEntry({
      candidates,
      openTeams,
      teamedUserIds,
      teamsEnabled,
      viewerTeam,
    });
  }

  it("hides classmates who are already on a team", () => {
    const result = shape(null);

    expect(result.candidates.map((c) => c.userId)).toEqual(["solo-1", "solo-2"]);
  });

  it("hides teams that do not have two members yet", () => {
    expect(shape(null).openTeams.map((t) => t.teamId)).toEqual(["team-open"]);
  });

  it("shows nothing once the viewer's team is complete", () => {
    const result = shape(team("team-v", true));

    expect(result.candidates).toEqual([]);
    expect(result.openTeams).toEqual([]);
  });

  it("lets a recruiting viewer invite solo classmates but not merge teams", () => {
    const result = shape(team("team-v", false));

    expect(result.candidates.map((c) => c.userId)).toEqual(["solo-1", "solo-2"]);
    expect(result.openTeams).toEqual([]);
  });

  it("never offers the viewer their own team", () => {
    const result = shape(team("team-open", false, ["teamed-1", "teamed-2"]));

    expect(result.openTeams).toEqual([]);
  });

  it("treats a one-member viewer team as no team at all", () => {
    const result = shape(team("team-v", false, ["only-me"]));

    expect(result.viewerTeam).toBeNull();
    expect(result.openTeams.map((t) => t.teamId)).toEqual(["team-open"]);
  });

  describe("with teams disabled", () => {
    it("offers no open teams", () => {
      expect(shape(null, false).openTeams).toEqual([]);
    });

    it("treats an open viewer team as complete, so discovery collapses like a match", () => {
      const result = shape(team("team-v", false), false);

      expect(result.viewerTeam?.isComplete).toBe(true);
      expect(result.candidates).toEqual([]);
      expect(result.openTeams).toEqual([]);
    });
  });
});

describe("isRenderableTeam", () => {
  it.each([
    [null, false],
    [{ memberUserIds: ["a"] }, false],
    [{ memberUserIds: ["a", "b"] }, true],
  ])("%o -> %s", (input, expected) => {
    expect(isRenderableTeam(input)).toBe(expected);
  });
});

describe("pickTeamContact", () => {
  it("picks the earliest member", () => {
    expect(
      pickTeamContact([
        { joinedAt: new Date("2026-02-01"), userId: "later" },
        { joinedAt: new Date("2026-01-01"), userId: "earlier" },
      ])?.userId,
    ).toBe("earlier");
  });

  it("breaks ties on id so the choice is stable", () => {
    const sameMoment = new Date("2026-01-01");

    expect(
      pickTeamContact([
        { joinedAt: sameMoment, userId: "b" },
        { joinedAt: sameMoment, userId: "a" },
      ])?.userId,
    ).toBe("a");
  });

  it("returns null for an empty team", () => {
    expect(pickTeamContact([])).toBeNull();
  });
});

describe("formatTeamNoun", () => {
  it.each([
    [2, "partner"],
    [3, "team"],
    [5, "team"],
  ])("%i members -> %s", (count, expected) => {
    expect(formatTeamNoun(count)).toBe(expected);
  });
});
