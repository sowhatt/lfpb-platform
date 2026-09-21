"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type Membership = {
  organizationId: string;
  role: string;
};

type Club = {
  id: string;
  organizationId: string;
  name: string;
  shortName?: string | null;
  code?: string | null;
  division?: string | null;
};

type Organization = {
  id: string;
  name?: string | null;
  club?: Club | null;
};

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  nationality?: string | null;
  federationId?: string | null;
};

type Registration = {
  id: string;
  organizationId: string;
  status: string;
  startDate: string;
  endDate?: string | null;
  playerProfile?: {
    position?: string | null;
    shirtName?: string | null;
    shirtNumber?: number | null;
  } | null;
  licenses?: Array<{
    id: string;
    number?: string | null;
    season: string;
    status: string;
  }>;
};

type Transfer = {
  id: string;
  personId: string;
  sourceOrganizationId: string;
  targetOrganizationId: string;
  sourceRegistrationId: string;
  targetRegistrationId?: string | null;
  status: string;
  requestedStartDate: string;
  requestedAt?: string | null;
  formerClubDecidedAt?: string | null;
  leagueReviewedAt?: string | null;
  leagueDecidedAt?: string | null;
  effectiveAt?: string | null;
  reason?: string | null;
  formerClubReason?: string | null;
  leagueReason?: string | null;
  createdAt: string;
  person: Person;
  season: {
    id: string;
    name: string;
  };
  sourceOrganization: Organization;
  targetOrganization: Organization;
  sourceRegistration: Registration;
  targetRegistration?: Registration | null;
};

type TransferCandidate = {
  personId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  federationId?: string | null;
  sourceRegistrationId: string | null;
  currentClub?: {
    organizationId: string;
    name?: string | null;
    code?: string | null;
    shortName?: string | null;
  } | null;
  currentLicense?: {
    id: string;
    number?: string | null;
    status: string;
  } | null;
  transferable: boolean;
  blockingReason?: string | null;
  dataQuality: {
    multipleActiveRegistrations: boolean;
  };
};

type Season = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status?: string;
};

type Props = {
  token: string;
  membership: Membership;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  REQUESTED: "Demandé",
  AGREED: "Accord club quitté",
  OPPOSED: "Opposition club quitté",
  LEAGUE_REVIEW: "Instruction Ligue",
  APPROVED: "Approuvé",
  REJECTED: "Rejeté",
  CANCELLED: "Annulé",
  EFFECTIVE: "Effectif",
};

const STATUS_ORDER = [
  "DRAFT",
  "REQUESTED",
  "AGREED",
  "LEAGUE_REVIEW",
  "APPROVED",
  "EFFECTIVE",
];

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const raw =
      typeof data === "object" && data !== null && "message" in data
        ? (data as { message?: string | string[] }).message
        : undefined;

    throw new Error(
      Array.isArray(raw)
        ? raw.join(" · ")
        : (raw ?? `Erreur ${response.status}`),
    );
  }

  return data as T;
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function clubName(organization?: Organization | null) {
  return (
    organization?.club?.shortName ||
    organization?.club?.name ||
    organization?.name ||
    "Club"
  );
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function PlayerTransfersWorkspace({ token, membership }: Props) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidates, setCandidates] = useState<TransferCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] =
    useState<TransferCandidate | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [requestedStartDate, setRequestedStartDate] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [creating, setCreating] = useState(false);

  const isLeague = membership.role === "LIGUE_ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await request<Transfer[]>(
        "/registries/player-transfers",
        token,
      );
      setTransfers(data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chargement des transferts impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return transfers;

    return transfers.filter((transfer) => {
      const haystack = [
        transfer.person.firstName,
        transfer.person.lastName,
        transfer.person.federationId,
        clubName(transfer.sourceOrganization),
        clubName(transfer.targetOrganization),
        transfer.season.name,
        statusLabel(transfer.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(value);
    });
  }, [query, transfers]);

  async function openCreateTransfer() {
    setCreateOpen(true);
    setSelected(null);
    setError("");
    setMessage("");
    setCandidates([]);
    setSelectedCandidate(null);
    setCandidateQuery("");
    setRequestedStartDate("");
    setTransferReason("");

    try {
      const data = await request<Season[]>("/seasons", token);
      const available = data.filter(
        (season) => !season.name.startsWith("DISCIPLINE-SMOKE-"),
      );

      setSeasons(available);

      if (available.length > 0) {
        setSeasonId(available[0].id);
      } else {
        setSeasonId("");
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chargement des saisons impossible",
      );
    }
  }

  async function searchTransferCandidates() {
    const value = candidateQuery.trim();

    if (value.length < 2) {
      setError("Saisissez au moins 2 caractères pour rechercher un joueur.");
      return;
    }

    setCandidateLoading(true);
    setError("");
    setMessage("");
    setSelectedCandidate(null);

    try {
      const data = await request<TransferCandidate[]>(
        `/registries/player-transfers/candidates/search?q=${encodeURIComponent(value)}`,
        token,
      );

      setCandidates(data);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Recherche du joueur impossible",
      );
    } finally {
      setCandidateLoading(false);
    }
  }

  async function createTransfer() {
    if (!selectedCandidate) {
      setError("Sélectionnez d'abord un joueur.");
      return;
    }

    if (
      !selectedCandidate.transferable ||
      !selectedCandidate.sourceRegistrationId
    ) {
      setError(
        selectedCandidate.blockingReason ||
          "Ce joueur ne peut pas faire l'objet d'une mutation.",
      );
      return;
    }

    if (!seasonId) {
      setError("Sélectionnez une saison.");
      return;
    }

    if (!requestedStartDate) {
      setError("Renseignez la date de prise d'effet.");
      return;
    }

    if (
      !window.confirm(
        `Créer une demande de transfert pour ${selectedCandidate.firstName} ${selectedCandidate.lastName} ?`,
      )
    ) {
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const created = await request<Transfer>(
        "/registries/player-transfers",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            personId: selectedCandidate.personId,
            sourceRegistrationId: selectedCandidate.sourceRegistrationId,
            targetOrganizationId: membership.organizationId,
            requestedStartDate,
            seasonId,
            ...(transferReason.trim() ? { reason: transferReason.trim() } : {}),
          }),
        },
      );

      await load();

      setCreateOpen(false);
      setCandidates([]);
      setSelectedCandidate(null);
      setCandidateQuery("");
      setRequestedStartDate("");
      setTransferReason("");
      setMessage(
        "La demande de transfert a été créée en brouillon. Vous pouvez maintenant la vérifier puis la soumettre.",
      );

      await openTransfer(created.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Création de la demande impossible",
      );
    } finally {
      setCreating(false);
    }
  }

  async function openTransfer(transferId: string) {
    setDetailLoading(true);
    setError("");

    try {
      const detail = await request<Transfer>(
        `/registries/player-transfers/${transferId}`,
        token,
      );
      setSelected(detail);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Ouverture du transfert impossible",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function relationLabel(transfer: Transfer) {
    if (isLeague) return "Ligue";

    if (transfer.sourceOrganizationId === membership.organizationId) {
      return "Sortant";
    }

    if (transfer.targetOrganizationId === membership.organizationId) {
      return "Entrant";
    }

    return "—";
  }

  function progressIndex(status: string) {
    if (status === "OPPOSED") return 2;
    if (status === "REJECTED" || status === "CANCELLED") return -1;
    return STATUS_ORDER.indexOf(status);
  }

  async function refreshAfterAction(transferId: string) {
    const [list, detail] = await Promise.all([
      request<Transfer[]>("/registries/player-transfers", token),
      request<Transfer>(`/registries/player-transfers/${transferId}`, token),
    ]);

    setTransfers(list);
    setSelected(detail);
  }

  async function runAction(
    transfer: Transfer,
    path: string,
    body?: Record<string, unknown>,
    successMessage?: string,
  ) {
    if (busy) return;

    setBusy(transfer.id);
    setError("");
    setMessage("");

    try {
      await request(
        `/registries/player-transfers/${transfer.id}${path}`,
        token,
        {
          method: "POST",
          body: body ? JSON.stringify(body) : undefined,
        },
      );

      await refreshAfterAction(transfer.id);
      setMessage(successMessage ?? "Dossier mis à jour.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "L'opération n'a pas pu être réalisée",
      );
    } finally {
      setBusy("");
    }
  }

  async function submitTransfer(transfer: Transfer) {
    if (!window.confirm("Soumettre cette demande de transfert ?")) return;

    await runAction(
      transfer,
      "/submit",
      undefined,
      "La demande a été transmise au club quitté.",
    );
  }

  async function formerClubDecision(
    transfer: Transfer,
    decision: "AGREED" | "OPPOSED",
  ) {
    let reason: string | undefined;

    if (decision === "OPPOSED") {
      const value = window.prompt(
        "Motif de l'opposition du club quitté (3 caractères minimum) :",
      );

      if (value === null) return;

      reason = value.trim();

      if (reason.length < 3) {
        setError(
          "Le motif de l'opposition doit contenir au moins 3 caractères.",
        );
        return;
      }
    }

    const label =
      decision === "AGREED"
        ? "Confirmer l'accord du club quitté ?"
        : "Confirmer l'opposition du club quitté ?";

    if (!window.confirm(label)) return;

    await runAction(
      transfer,
      "/former-club-decision",
      {
        decision,
        ...(reason ? { reason } : {}),
      },
      decision === "AGREED"
        ? "L'accord du club quitté a été enregistré."
        : "L'opposition du club quitté a été enregistrée.",
    );
  }

  async function startLeagueReview(transfer: Transfer) {
    if (!window.confirm("Prendre ce dossier en instruction Ligue ?")) return;

    await runAction(
      transfer,
      "/league-review",
      undefined,
      "Le dossier est maintenant en instruction Ligue.",
    );
  }

  async function leagueDecision(
    transfer: Transfer,
    decision: "APPROVED" | "REJECTED",
  ) {
    let reason: string | undefined;

    if (decision === "REJECTED") {
      const value = window.prompt(
        "Motif du rejet Ligue (3 caractères minimum) :",
      );

      if (value === null) return;

      reason = value.trim();

      if (reason.length < 3) {
        setError("Le motif du rejet doit contenir au moins 3 caractères.");
        return;
      }
    }

    const label =
      decision === "APPROVED"
        ? "Approuver officiellement ce transfert ?"
        : "Rejeter officiellement ce transfert ?";

    if (!window.confirm(label)) return;

    await runAction(
      transfer,
      "/league-decision",
      {
        decision,
        ...(reason ? { reason } : {}),
      },
      decision === "APPROVED"
        ? "Le transfert a été approuvé par la Ligue."
        : "Le transfert a été rejeté par la Ligue.",
    );
  }

  async function makeEffective(transfer: Transfer) {
    if (
      !window.confirm(
        "Rendre ce transfert effectif ? L'inscription du club quitté sera clôturée et une nouvelle inscription sera créée dans le club d'accueil.",
      )
    ) {
      return;
    }

    await runAction(
      transfer,
      "/effective",
      undefined,
      "Le transfert est désormais effectif.",
    );
  }

  const selectedIsSourceClub =
    selected?.sourceOrganizationId === membership.organizationId;

  const selectedIsTargetClub =
    selected?.targetOrganizationId === membership.organizationId;

  return (
    <>
      <section className="workspace-actions">
        <div>
          <label>{isLeague ? "LIGUE · MUTATIONS" : "CLUB · MUTATIONS"}</label>
          <h2>Transferts de joueurs</h2>
          <p>
            {isLeague
              ? "Suivez les demandes, instruisez les dossiers et rendez les mutations effectives."
              : "Suivez les joueurs entrants et sortants de votre club."}
          </p>
        </div>

        {!isLeague && (
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => void openCreateTransfer()}
            >
              + Nouvelle demande
            </button>
          </div>
        )}
      </section>

      {error && <div className="api-error">{error}</div>}
      {message && <div className="success-message">{message}</div>}

      {createOpen && !isLeague && (
        <section className="data-panel">
          <div className="panel-header">
            <div>
              <label>NOUVELLE MUTATION</label>
              <h3>Créer une demande de transfert</h3>
            </div>

            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setCandidates([]);
                setSelectedCandidate(null);
              }}
            >
              Fermer ×
            </button>
          </div>

          <div className="entity-form">
            <label>
              Rechercher le joueur
              <div className="actions">
                <input
                  type="search"
                  placeholder="Nom, prénom ou identifiant FBF"
                  value={candidateQuery}
                  onChange={(event) => setCandidateQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchTransferCandidates();
                    }
                  }}
                />

                <button
                  type="button"
                  disabled={candidateLoading}
                  onClick={() => void searchTransferCandidates()}
                >
                  {candidateLoading ? "Recherche…" : "Rechercher"}
                </button>
              </div>
            </label>
          </div>

          {candidates.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Joueur</th>
                    <th>ID FBF</th>
                    <th>Club actuel</th>
                    <th>Licence</th>
                    <th>Éligibilité</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.personId}>
                      <td>
                        <strong>
                          {candidate.firstName} {candidate.lastName}
                        </strong>
                        <small>{formatDate(candidate.birthDate)}</small>
                      </td>

                      <td>{candidate.federationId ?? "—"}</td>

                      <td>
                        {candidate.currentClub?.shortName ||
                          candidate.currentClub?.name ||
                          "—"}
                      </td>

                      <td>
                        {candidate.currentLicense?.number ??
                          candidate.currentLicense?.status ??
                          "—"}
                      </td>

                      <td>
                        <span
                          className={`badge ${
                            candidate.transferable ? "effective" : "rejected"
                          }`}
                        >
                          {candidate.transferable
                            ? "Transférable"
                            : candidate.blockingReason || "Bloqué"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          disabled={!candidate.transferable}
                          onClick={() => setSelectedCandidate(candidate)}
                        >
                          {selectedCandidate?.personId === candidate.personId
                            ? "Sélectionné"
                            : "Choisir"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {candidateQuery.trim().length >= 2 &&
            !candidateLoading &&
            candidates.length === 0 && (
              <div className="empty-state">
                Aucun joueur ne correspond à cette recherche.
              </div>
            )}

          {selectedCandidate && (
            <div className="player-profile">
              <div className="player-identity">
                <label>JOUEUR SÉLECTIONNÉ</label>
                <h3>
                  {selectedCandidate.firstName} {selectedCandidate.lastName}
                </h3>

                <dl>
                  <div>
                    <dt>Club quitté</dt>
                    <dd>
                      {selectedCandidate.currentClub?.shortName ||
                        selectedCandidate.currentClub?.name ||
                        "—"}
                    </dd>
                  </div>

                  <div>
                    <dt>Identifiant FBF</dt>
                    <dd>{selectedCandidate.federationId ?? "—"}</dd>
                  </div>
                </dl>

                <div className="entity-form">
                  <label>
                    Saison
                    <select
                      value={seasonId}
                      onChange={(event) => setSeasonId(event.target.value)}
                    >
                      <option value="">Sélectionner une saison</option>
                      {seasons.map((season) => (
                        <option key={season.id} value={season.id}>
                          {season.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Date de prise d'effet
                    <input
                      type="date"
                      value={requestedStartDate}
                      onChange={(event) =>
                        setRequestedStartDate(event.target.value)
                      }
                    />
                  </label>

                  <label>
                    Motif ou observation
                    <textarea
                      maxLength={500}
                      placeholder="Facultatif"
                      value={transferReason}
                      onChange={(event) =>
                        setTransferReason(event.target.value)
                      }
                    />
                  </label>

                  <div className="actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={creating}
                      onClick={() => void createTransfer()}
                    >
                      {creating ? "Création…" : "Créer le brouillon"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="data-panel">
        <div className="panel-header">
          <div>
            <label>PORTEFEUILLE</label>
            <h3>
              {loading
                ? "Chargement…"
                : `${filtered.length} transfert${filtered.length > 1 ? "s" : ""}`}
            </h3>
          </div>

          <input
            type="search"
            placeholder="Joueur, club, saison, statut…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {!loading && filtered.length === 0 ? (
          <div className="empty-state">
            Aucun transfert ne correspond à votre recherche.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Club quitté</th>
                  <th>Club d'accueil</th>
                  <th>Saison</th>
                  <th>Prise d'effet</th>
                  {!isLeague && <th>Flux</th>}
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((transfer) => (
                  <tr key={transfer.id}>
                    <td>
                      <strong>
                        {transfer.person.firstName} {transfer.person.lastName}
                      </strong>
                      <small>
                        {transfer.person.federationId ?? "ID FBF non renseigné"}
                      </small>
                    </td>
                    <td>{clubName(transfer.sourceOrganization)}</td>
                    <td>{clubName(transfer.targetOrganization)}</td>
                    <td>{transfer.season.name}</td>
                    <td>{formatDate(transfer.requestedStartDate)}</td>
                    {!isLeague && <td>{relationLabel(transfer)}</td>}
                    <td>
                      <span
                        className={`badge ${transfer.status.toLowerCase()}`}
                      >
                        {statusLabel(transfer.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => void openTransfer(transfer.id)}
                        disabled={detailLoading}
                      >
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section className="player-profile">
          <button
            className="profile-close"
            type="button"
            onClick={() => setSelected(null)}
          >
            Fermer ×
          </button>

          <div className="player-photo">
            <span>
              {selected.person.firstName.slice(0, 1)}
              {selected.person.lastName.slice(0, 1)}
            </span>
            <small>Dossier de mutation</small>
          </div>

          <div className="player-identity">
            <label>TRANSFERT JOUEUR</label>
            <h2>
              {selected.person.firstName} {selected.person.lastName}
            </h2>

            <dl>
              <div>
                <dt>Club quitté</dt>
                <dd>{clubName(selected.sourceOrganization)}</dd>
              </div>
              <div>
                <dt>Club d'accueil</dt>
                <dd>{clubName(selected.targetOrganization)}</dd>
              </div>
              <div>
                <dt>Saison</dt>
                <dd>{selected.season.name}</dd>
              </div>
              <div>
                <dt>Prise d'effet</dt>
                <dd>{formatDate(selected.requestedStartDate)}</dd>
              </div>
              <div>
                <dt>Statut</dt>
                <dd>{statusLabel(selected.status)}</dd>
              </div>
              <div>
                <dt>Identifiant FBF</dt>
                <dd>{selected.person.federationId ?? "—"}</dd>
              </div>
            </dl>

            <div className="license-workflow">
              <div className="license-section-heading">
                <div>
                  <label>CIRCUIT DE MUTATION</label>
                  <h3>Avancement du dossier</h3>
                </div>
                <span className="license-current-status">
                  {statusLabel(selected.status)}
                </span>
              </div>

              <div className="license-stepper">
                {[
                  ["DRAFT", "Brouillon"],
                  ["REQUESTED", "Demande"],
                  ["AGREED", "Club quitté"],
                  ["LEAGUE_REVIEW", "Instruction"],
                  ["APPROVED", "Décision"],
                  ["EFFECTIVE", "Effectif"],
                ].map(([status, label], index) => {
                  const current = progressIndex(selected.status);
                  const done = current >= 0 && index < current;
                  const active =
                    status === selected.status ||
                    (status === "AGREED" && selected.status === "OPPOSED");

                  return (
                    <div
                      key={status}
                      className={`license-step ${done ? "is-done" : ""} ${
                        active ? "is-active" : ""
                      }`}
                    >
                      <div className="license-step-marker">
                        <span>{done ? "✓" : index + 1}</span>
                      </div>
                      <div className="license-step-copy">
                        <strong>{label}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="workspace-actions">
              <div>
                <label>ACTIONS DISPONIBLES</label>
                <h3>Traitement du dossier</h3>
              </div>

              <div className="actions">
                {!isLeague &&
                  selectedIsTargetClub &&
                  selected.status === "DRAFT" && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy === selected.id}
                      onClick={() => void submitTransfer(selected)}
                    >
                      {busy === selected.id ? "Traitement…" : "Soumettre"}
                    </button>
                  )}

                {!isLeague &&
                  selectedIsSourceClub &&
                  selected.status === "REQUESTED" && (
                    <>
                      <button
                        type="button"
                        className="primary"
                        disabled={busy === selected.id}
                        onClick={() =>
                          void formerClubDecision(selected, "AGREED")
                        }
                      >
                        Donner l'accord
                      </button>

                      <button
                        type="button"
                        disabled={busy === selected.id}
                        onClick={() =>
                          void formerClubDecision(selected, "OPPOSED")
                        }
                      >
                        S'opposer
                      </button>
                    </>
                  )}

                {isLeague &&
                  ["AGREED", "OPPOSED"].includes(selected.status) && (
                    <button
                      type="button"
                      className="primary"
                      disabled={busy === selected.id}
                      onClick={() => void startLeagueReview(selected)}
                    >
                      Prendre en instruction
                    </button>
                  )}

                {isLeague && selected.status === "LEAGUE_REVIEW" && (
                  <>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy === selected.id}
                      onClick={() => void leagueDecision(selected, "APPROVED")}
                    >
                      Approuver
                    </button>

                    <button
                      type="button"
                      disabled={busy === selected.id}
                      onClick={() => void leagueDecision(selected, "REJECTED")}
                    >
                      Rejeter
                    </button>
                  </>
                )}

                {isLeague && selected.status === "APPROVED" && (
                  <button
                    type="button"
                    className="primary"
                    disabled={busy === selected.id}
                    onClick={() => void makeEffective(selected)}
                  >
                    {busy === selected.id ? "Traitement…" : "Rendre effectif"}
                  </button>
                )}

                {selected.status === "EFFECTIVE" && (
                  <span className="success-message">
                    Mutation terminée · Nouvelle inscription créée
                  </span>
                )}
              </div>
            </div>

            {selected.reason && (
              <p>
                <strong>Motif :</strong> {selected.reason}
              </p>
            )}

            {selected.formerClubReason && (
              <p>
                <strong>Observation club quitté :</strong>{" "}
                {selected.formerClubReason}
              </p>
            )}

            {selected.leagueReason && (
              <p>
                <strong>Décision Ligue :</strong> {selected.leagueReason}
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
