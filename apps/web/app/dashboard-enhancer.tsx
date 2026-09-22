"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClubAiAssistant } from "./club-ai-assistant";
import { ClubMatchSignaturesWorkspace } from "./club-match-signatures-workspace";
import { OfficialMissionsWorkspace } from "./official-missions-workspace";
import { LeagueCompetitionCalendar } from "./league-competition-calendar";
import { LeagueOfficialCalendar } from "./league-official-calendar";
import { LeagueMatchHomologation } from "./league-match-homologation";
import { LeagueStandings } from "./league-standings";
import { LeagueClubsManagement } from "./league-clubs-management";
import { LeaguePlayersManagement } from "./league-players-management";
import { PlayerTransfersWorkspace } from "./player-transfers-workspace";

type Actor = {
  memberships?: Array<{ organizationId: string; role: string }>;
};

export function DashboardEnhancer() {
  const [active, setActive] = useState("");
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [token, setToken] = useState("");
  const [actor, setActor] = useState<Actor | null>(null);

  useEffect(() => {
    let observer: MutationObserver | null = null;

    const syncSession = () => {
      setToken(sessionStorage.getItem("lfpb-token") ?? "");
      const rawActor = sessionStorage.getItem("lfpb-actor");
      if (!rawActor) {
        setActor(null);
        return;
      }
      try {
        setActor(JSON.parse(rawActor) as Actor);
      } catch {
        setActor(null);
      }
    };

    const attachDashboard = () => {
      syncSession();
      const main = document.querySelector("main");
      if (!main) return;

      let enhancementHost = main.querySelector<HTMLElement>(
        "[data-dashboard-enhancement-host]",
      );
      if (!enhancementHost) {
        enhancementHost = document.createElement("div");
        enhancementHost.dataset.dashboardEnhancementHost = "true";
        const header = main.querySelector("header");
        if (header?.nextSibling)
          main.insertBefore(enhancementHost, header.nextSibling);
        else main.appendChild(enhancementHost);
      }
      setHost(enhancementHost);

      const readActive = () => {
        syncSession();
        setActive(main.querySelector("header h1")?.textContent?.trim() ?? "");
      };
      readActive();
      if (!observer) {
        observer = new MutationObserver(readActive);
        observer.observe(main, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    };

    attachDashboard();
    const timer = window.setInterval(attachDashboard, 300);
    return () => {
      window.clearInterval(timer);
      observer?.disconnect();
    };
  }, []);

  const membership = actor?.memberships?.[0];
  const enhanced =
    active === "Assistant IA" ||
    active === "Mes rencontres" ||
    active === "Feuilles de match" ||
    active === "Calendrier officiel" ||
    active === "Calendrier assisté par IA" ||
    active === "Homologation" ||
    active === "Classement & statistiques" ||
    active === "Clubs" ||
    active === "Joueurs" ||
    active === "Transferts";

  useEffect(() => {
    if (membership?.role !== "LIGUE_ADMIN") return;
    if (active === "Retours FBF") {
      window.location.assign("/fbf-return");
      return;
    }
    if (active === "Désignations")
      window.location.assign("/league-assignments");
  }, [active, membership?.role]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main || !host) return;
    const candidates = Array.from(main.children).filter(
      (element) =>
        element.tagName !== "HEADER" &&
        element !== host &&
        !element.classList.contains("api-error"),
    ) as HTMLElement[];

    for (const element of candidates) {
      if (enhanced) {
        if (!element.dataset.dashboardOriginalDisplay)
          element.dataset.dashboardOriginalDisplay =
            element.style.display || "__empty__";
        element.style.display = "none";
      } else if (element.dataset.dashboardOriginalDisplay) {
        element.style.display =
          element.dataset.dashboardOriginalDisplay === "__empty__"
            ? ""
            : element.dataset.dashboardOriginalDisplay;
        delete element.dataset.dashboardOriginalDisplay;
      }
    }

    return () => {
      for (const element of candidates) {
        if (element.dataset.dashboardOriginalDisplay) {
          element.style.display =
            element.dataset.dashboardOriginalDisplay === "__empty__"
              ? ""
              : element.dataset.dashboardOriginalDisplay;
          delete element.dataset.dashboardOriginalDisplay;
        }
      }
    };
  }, [enhanced, host, active]);

  const content = useMemo(() => {
    if (!token || !membership) return null;
    if (
      active === "Calendrier officiel" &&
      ["LIGUE_ADMIN", "COMPETITION_MANAGER", "SCHEDULE_APPROVER"].includes(
        membership.role,
      )
    ) {
      return <LeagueOfficialCalendar token={token} />;
    }

    if (
      active === "Calendrier assisté par IA" &&
      ["LIGUE_ADMIN", "COMPETITION_MANAGER", "SCHEDULE_APPROVER"].includes(
        membership.role,
      )
    ) {
      return <LeagueCompetitionCalendar token={token} role={membership.role} />;
    }

    if (active === "Homologation" && membership.role === "LIGUE_ADMIN") {
      return <LeagueMatchHomologation token={token} />;
    }

    if (
      active === "Classement & statistiques" &&
      membership.role === "LIGUE_ADMIN"
    ) {
      return <LeagueStandings token={token} />;
    }

    if (active === "Clubs" && membership.role === "LIGUE_ADMIN") {
      return <LeagueClubsManagement token={token} />;
    }

    if (active === "Joueurs" && membership.role === "LIGUE_ADMIN") {
      return <LeaguePlayersManagement token={token} />;
    }
    if (
      active === "Transferts" &&
      ["LIGUE_ADMIN", "CLUB_ADMIN"].includes(membership.role)
    ) {
      return <PlayerTransfersWorkspace token={token} membership={membership} />;
    }
    if (active === "Assistant IA" && membership.role === "CLUB_ADMIN")
      return (
        <ClubAiAssistant
          token={token}
          organizationId={membership.organizationId}
        />
      );
    if (active === "Feuilles de match" && membership.role === "CLUB_ADMIN")
      return (
        <ClubMatchSignaturesWorkspace token={token} membership={membership} />
      );
    if (active === "Mes rencontres" && membership.role === "OFFICIEL")
      return <OfficialMissionsWorkspace token={token} />;
    return null;
  }, [active, membership, token]);

  if (!host || !content) return null;
  return createPortal(content, host);
}
