"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

type SportingSummary = {
  totalSeasons: number;
  league1Seasons: number;
  league2Seasons: number;
  titles: number;
  promotions: number;
  relegations: number;
};

type ClubSeason = {
  id: string;
  division: "LIGUE_1" | "LIGUE_2";
  finalRank?: number | null;
  outcome?:
    "PROMOTED" | "RELEGATED" | "MAINTAINED" | "WITHDRAWN" | "EXCLUDED" | null;
  notes?: string | null;
  season: {
    id: string;
    name: string;
    status: "DRAFT" | "ACTIVE" | "CLOSED";
    startDate: string;
    endDate: string;
  };
};

type Season = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  startDate: string;
  endDate: string;
};

type ClubHistoryEvent = {
  id: string;
  type: string;
  effectiveDate: string;
  title: string;
  previousValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  actor?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

type Club = {
  id: string;
  name: string;
  code: string;
  type: string;
  active: boolean;
  club?: {
    id: string;
    shortName: string;
    division: "LIGUE_1" | "LIGUE_2";
    city?: string | null;
    colors?: string | null;
    seasons?: ClubSeason[];
    historyEvents?: ClubHistoryEvent[];
    sportingSummary?: SportingSummary;
  } | null;
};

type Props = {
  token: string;
};

async function api<T>(
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
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message?: unknown }).message)
        : `Erreur ${response.status}`;

    throw new Error(message);
  }

  return data as T;
}

function divisionLabel(value?: string) {
  if (value === "LIGUE_1") return "Ligue 1";
  if (value === "LIGUE_2") return "Ligue 2";
  return "—";
}

function outcomeLabel(value?: string | null) {
  if (value === "PROMOTED") return "Montée";
  if (value === "RELEGATED") return "Relégation";
  if (value === "MAINTAINED") return "Maintien";
  if (value === "WITHDRAWN") return "Retrait";
  if (value === "EXCLUDED") return "Exclusion";
  return "—";
}

function formatDate(value?: string) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function LeagueClubsManagement({ token }: Props) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [divisionFilter, setDivisionFilter] = useState<"ALL" | "LIGUE_1" | "LIGUE_2">("ALL");
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingClub, setEditingClub] = useState(false);
  const [renamingClub, setRenamingClub] = useState(false);
  const [editingSportingPath, setEditingSportingPath] = useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const detailRef = useRef<HTMLElement | null>(null);

  const loadClubs = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const organizations = await api<Club[]>("/organizations", token);
      setClubs(
        organizations.filter((organization) => organization.type === "CLUB"),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chargement des clubs impossible",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  async function openClub(organizationId: string) {
    setDetailLoading(true);
    setError("");
    setMessage("");

    try {
      const detail = await api<Club>(`/organizations/${organizationId}`, token);
      setSelectedClub(detail);
      setEditingClub(false);
      setRenamingClub(false);
      setEditingSportingPath(false);

      window.setTimeout(() => {
        detailRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chargement de la fiche club impossible",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshSelectedClub() {
    if (!selectedClub) return;

    const detail = await api<Club>(`/organizations/${selectedClub.id}`, token);

    setSelectedClub(detail);
    await loadClubs();
  }

  async function updateClubInformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClub || saving) return;

    const data = new FormData(event.currentTarget);
    const shortName = String(data.get("shortName") ?? "").trim();
    const city = String(data.get("city") ?? "").trim();
    const colors = String(data.get("colors") ?? "").trim();

    if (shortName.length < 2) {
      setError("Le nom court doit contenir au moins 2 caractères.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api(`/organizations/${selectedClub.id}/club`, token, {
        method: "PATCH",
        body: JSON.stringify({
          shortName,
          city,
          colors,
        }),
      });

      await refreshSelectedClub();
      setEditingClub(false);
      setMessage("Les informations du club ont été mises à jour.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Modification du club impossible",
      );
    } finally {
      setSaving(false);
    }
  }

  async function renameSelectedClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClub || saving) return;

    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const effectiveDate = String(data.get("effectiveDate") ?? "");
    const reason = String(data.get("reason") ?? "").trim();

    if (name.length < 2) {
      setError("Le nouveau nom officiel est obligatoire.");
      return;
    }

    if (!effectiveDate) {
      setError("La date d'effet est obligatoire.");
      return;
    }

    if (reason.length < 2) {
      setError("Le motif du changement de nom est obligatoire.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api(`/organizations/${selectedClub.id}/club/rename`, token, {
        method: "POST",
        body: JSON.stringify({
          name,
          effectiveDate,
          reason,
        }),
      });

      await refreshSelectedClub();
      setRenamingClub(false);
      setMessage("Le changement de nom officiel a été enregistré.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Changement de nom impossible",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleSelectedClubStatus() {
    if (!selectedClub || saving) return;

    const nextActive = !selectedClub.active;
    const reason = window.prompt(
      nextActive
        ? "Motif de la réactivation du club (facultatif)"
        : "Motif de la désactivation du club (facultatif)",
    );

    if (reason === null) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api(`/organizations/${selectedClub.id}/club/status`, token, {
        method: "PATCH",
        body: JSON.stringify({
          active: nextActive,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });

      await refreshSelectedClub();
      setMessage(
        nextActive ? "Le club a été réactivé." : "Le club a été désactivé.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Modification du statut impossible",
      );
    } finally {
      setSaving(false);
    }
  }

  async function openSportingPathEditor() {
    const nextOpen = !editingSportingPath;

    setEditingSportingPath(nextOpen);
    setEditingClub(false);
    setRenamingClub(false);
    setError("");
    setMessage("");

    if (!nextOpen || seasons.length > 0) return;

    setSeasonsLoading(true);

    try {
      const availableSeasons = await api<Season[]>("/seasons", token);
      setSeasons(
        availableSeasons.filter(
          (season) => !season.name.startsWith("DISCIPLINE-SMOKE-"),
        ),
      );
    } catch (reason) {
      setEditingSportingPath(false);
      setError(
        reason instanceof Error
          ? reason.message
          : "Chargement des saisons impossible",
      );
    } finally {
      setSeasonsLoading(false);
    }
  }

  const selectedSportingSeason =
    selectedClub?.club?.seasons?.find(
      (entry) => entry.season.id === selectedSeasonId,
    ) ?? null;

  function sportingSeasonValue(
    field: "division" | "finalRank" | "outcome" | "notes",
  ) {
    if (!selectedSportingSeason) {
      if (field === "division") {
        return selectedClub?.club?.division ?? "LIGUE_1";
      }

      return "";
    }

    return selectedSportingSeason[field] ?? "";
  }

  async function saveSportingPath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClub || saving) return;

    const data = new FormData(event.currentTarget);
    const seasonId = String(data.get("seasonId") ?? "");
    const division = String(data.get("division") ?? "");
    const finalRankRaw = String(data.get("finalRank") ?? "").trim();
    const outcome = String(data.get("outcome") ?? "");
    const notes = String(data.get("notes") ?? "").trim();

    if (!seasonId) {
      setError("Sélectionnez une saison.");
      return;
    }

    if (!["LIGUE_1", "LIGUE_2"].includes(division)) {
      setError("Sélectionnez une division.");
      return;
    }

    const finalRank = finalRankRaw ? Number(finalRankRaw) : undefined;

    if (
      finalRank !== undefined &&
      (!Number.isInteger(finalRank) || finalRank < 1)
    ) {
      setError(
        "Le classement final doit être un entier supérieur ou égal à 1.",
      );
      return;
    }

    const allowedOutcomes = [
      "PROMOTED",
      "RELEGATED",
      "MAINTAINED",
      "WITHDRAWN",
      "EXCLUDED",
    ];

    if (outcome && !allowedOutcomes.includes(outcome)) {
      setError("L'issue sportive sélectionnée est invalide.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await api(
        `/organizations/${selectedClub.id}/club/seasons/${seasonId}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            division,
            ...(finalRank !== undefined ? { finalRank } : {}),
            ...(outcome ? { outcome } : {}),
            ...(notes ? { notes } : {}),
          }),
        },
      );

      await refreshSelectedClub();
      setEditingSportingPath(false);
      setSelectedSeasonId("");
      setMessage("Le parcours sportif du club a été mis à jour.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Mise à jour du parcours sportif impossible",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    const form = event.currentTarget;
    const data = new FormData(form);

    const name = String(data.get("name") ?? "").trim();
    const shortName = String(data.get("shortName") ?? "").trim();
    const code = String(data.get("code") ?? "")
      .trim()
      .toUpperCase();
    const division = String(data.get("division") ?? "");
    const city = String(data.get("city") ?? "").trim();

    setError("");
    setMessage("");

    if (name.length < 2) {
      setError("Le nom officiel du club est obligatoire.");
      return;
    }

    if (shortName.length < 2) {
      setError("Le nom court du club est obligatoire.");
      return;
    }

    if (code.length < 2) {
      setError("Le code du club est obligatoire.");
      return;
    }

    if (!["LIGUE_1", "LIGUE_2"].includes(division)) {
      setError("Sélectionnez une division.");
      return;
    }

    setSaving(true);

    try {
      await api<Club>("/organizations/clubs", token, {
        method: "POST",
        body: JSON.stringify({
          name,
          shortName,
          code,
          division,
          ...(city ? { city } : {}),
        }),
      });

      form.reset();
      setCreating(false);
      setMessage(`Le club ${name} a été créé avec succès.`);
      await loadClubs();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Création du club impossible",
      );
    } finally {
      setSaving(false);
    }
  }

  const filteredClubs =
    divisionFilter === "ALL"
      ? clubs
      : clubs.filter(
          (club) => club.club?.division === divisionFilter,
        );

  return (
    <section>
      <section className="welcome-card league-clubs-hero">
        <span>ADMINISTRATION LIGUE</span>
        <h2>Gestion des clubs</h2>
        <p>
          Création et administration des clubs affiliés à la Ligue de Football
          Professionnel du Bénin.
        </p>
      </section>

      <section className="stats">
        <article>
          <span>CLUBS ENREGISTRÉS</span>
          <strong>{clubs.length}</strong>
          <small>Organisations de type club</small>
        </article>

        <article>
          <span>LIGUE 1</span>
          <strong>
            {clubs.filter((club) => club.club?.division === "LIGUE_1").length}
          </strong>
          <small>Clubs actuellement classés en Ligue 1</small>
        </article>

        <article>
          <span>LIGUE 2</span>
          <strong>
            {clubs.filter((club) => club.club?.division === "LIGUE_2").length}
          </strong>
          <small>Clubs actuellement classés en Ligue 2</small>
        </article>

        <article>
          <span>ACTIFS</span>
          <strong>{clubs.filter((club) => club.active).length}</strong>
          <small>Clubs actifs dans Digital Foot</small>
        </article>
      </section>

      <section className="business-filter-bar">
        <div>
          <label htmlFor="club-division-filter">Division</label>
          <select
            id="club-division-filter"
            value={divisionFilter}
            onChange={(event) =>
              setDivisionFilter(
                event.target.value as "ALL" | "LIGUE_1" | "LIGUE_2",
              )
            }
          >
            <option value="ALL">Tous les clubs</option>
            <option value="LIGUE_1">Ligue 1</option>
            <option value="LIGUE_2">Ligue 2</option>
          </select>
        </div>

        <strong>
          {filteredClubs.length} club
          {filteredClubs.length > 1 ? "s" : ""}
        </strong>
      </section>

      <article className="panel league-clubs-panel">
        <div className="title">
          <span>
            <label>RÉFÉRENTIEL CLUBS</label>
            <h2>Clubs gérés par la Ligue</h2>
          </span>

          <button
            type="button"
            className="primary"
            onClick={() => {
              setCreating((value) => !value);
              setError("");
              setMessage("");
            }}
          >
            {creating ? "Annuler" : "+ Ajouter un club"}
          </button>
        </div>

        {creating && (
          <form className="entity-form league-club-form" onSubmit={createClub}>
            <label>
              Nom officiel
              <input
                name="name"
                minLength={2}
                maxLength={120}
                required
                placeholder="Ex. AS Porto-Novo"
              />
            </label>

            <label>
              Nom court
              <input
                name="shortName"
                minLength={2}
                maxLength={50}
                required
                placeholder="Ex. AS Porto-Novo"
              />
            </label>

            <label>
              Code
              <input
                name="code"
                minLength={2}
                maxLength={20}
                required
                placeholder="Ex. ASPN"
                style={{ textTransform: "uppercase" }}
              />
            </label>

            <label>
              Division
              <select name="division" required defaultValue="">
                <option value="" disabled>
                  Sélectionner
                </option>
                <option value="LIGUE_1">Ligue 1</option>
                <option value="LIGUE_2">Ligue 2</option>
              </select>
            </label>

            <label>
              Ville
              <input name="city" maxLength={120} placeholder="Ex. Porto-Novo" />
            </label>
            <div className="league-club-form-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Création…" : "Créer le club"}
              </button>
            </div>
          </form>
        )}

        {error && <div className="api-error">{error}</div>}

        {message && (
          <p style={{ marginTop: "16px" }}>
            <strong>{message}</strong>
          </p>
        )}

        {loading ? (
          <p>Chargement des clubs…</p>
        ) : filteredClubs.length === 0 ? (
          <p>Aucun club enregistré.</p>
        ) : (
          <table className="league-clubs-table">
            <thead>
              <tr>
                <th>Club</th>
                <th>Code</th>
                <th>Division</th>
                <th>Ville</th>
                <th>État</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredClubs.map((club) => (
                <tr key={club.id}>
                  <td data-label="Club">
                    <strong>{club.name}</strong>
                    <br />
                    <small>{club.club?.shortName ?? "—"}</small>
                  </td>

                  <td>{club.code}</td>

                  <td>{divisionLabel(club.club?.division)}</td>

                  <td>{club.club?.city || "—"}</td>

                  <td>
                    <strong>{club.active ? "ACTIF" : "INACTIF"}</strong>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="league-club-manage-button"
                      disabled={detailLoading}
                      onClick={() => void openClub(club.id)}
                    >
                      Gérer le club
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      {selectedClub?.club && (
        <article ref={detailRef} className="panel league-club-detail">
          <div className="title">
            <span>
              <label>FICHE CLUB</label>
              <h2>{selectedClub.name}</h2>
            </span>

            <button
              type="button"
              className="league-club-close-button"
              onClick={() => setSelectedClub(null)}
            >
              Fermer
            </button>
          </div>

          <div className="league-club-actions">
            <button
              type="button"
              className="league-club-manage-button"
              onClick={() => {
                setEditingClub((value) => !value);
                setRenamingClub(false);
                setError("");
                setMessage("");
              }}
            >
              {editingClub
                ? "Annuler la modification"
                : "Modifier les informations"}
            </button>

            <button
              type="button"
              className="league-club-manage-button"
              onClick={() => {
                setRenamingClub((value) => !value);
                setEditingClub(false);
                setError("");
                setMessage("");
              }}
            >
              {renamingClub
                ? "Annuler le changement"
                : "Changer le nom officiel"}
            </button>

            <button
              type="button"
              className="league-club-status-button"
              disabled={saving}
              onClick={() => void toggleSelectedClubStatus()}
            >
              {selectedClub.active ? "Désactiver le club" : "Réactiver le club"}
            </button>
          </div>

          {editingClub && (
            <form
              className="entity-form league-club-edit-form"
              onSubmit={updateClubInformation}
            >
              <label>
                Nom court
                <input
                  name="shortName"
                  minLength={2}
                  maxLength={50}
                  required
                  defaultValue={selectedClub.club.shortName}
                />
              </label>

              <label>
                Ville
                <input
                  name="city"
                  maxLength={120}
                  defaultValue={selectedClub.club.city ?? ""}
                />
              </label>

              <label>
                Couleurs
                <input
                  name="colors"
                  maxLength={120}
                  defaultValue={selectedClub.club.colors ?? ""}
                  placeholder="Ex. Rouge et blanc"
                />
              </label>

              <div className="league-club-form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
          )}

          {renamingClub && (
            <form
              className="entity-form league-club-edit-form"
              onSubmit={renameSelectedClub}
            >
              <label>
                Nouveau nom officiel
                <input
                  name="name"
                  minLength={2}
                  maxLength={120}
                  required
                  defaultValue={selectedClub.name}
                />
              </label>

              <label>
                Date d'effet
                <input name="effectiveDate" type="date" required />
              </label>

              <label className="league-club-reason-field">
                Motif
                <input
                  name="reason"
                  minLength={2}
                  maxLength={500}
                  required
                  placeholder="Ex. décision administrative du club"
                />
              </label>

              <div className="league-club-form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Enregistrement…" : "Valider le changement"}
                </button>
              </div>
            </form>
          )}

          {error && <div className="api-error">{error}</div>}

          {message && (
            <p className="league-club-success">
              <strong>{message}</strong>
            </p>
          )}

          <section className="league-club-detail-grid">
            <div>
              <span>CODE</span>
              <strong>{selectedClub.code}</strong>
            </div>
            <div>
              <span>NOM COURT</span>
              <strong>{selectedClub.club.shortName}</strong>
            </div>
            <div>
              <span>DIVISION ACTUELLE</span>
              <strong>{divisionLabel(selectedClub.club.division)}</strong>
            </div>
            <div>
              <span>VILLE</span>
              <strong>{selectedClub.club.city || "—"}</strong>
            </div>
            <div>
              <span>COULEURS</span>
              <strong>{selectedClub.club.colors || "—"}</strong>
            </div>
            <div>
              <span>STATUT</span>
              <strong>{selectedClub.active ? "ACTIF" : "INACTIF"}</strong>
            </div>
          </section>

          <section className="league-club-section">
            <div className="league-club-section-heading league-club-section-heading-actions">
              <div>
                <span>PARCOURS SPORTIF</span>
                <h3>Historique Ligue 1 / Ligue 2</h3>
              </div>

              <button
                type="button"
                className="league-club-manage-button"
                disabled={seasonsLoading}
                onClick={() => void openSportingPathEditor()}
              >
                {seasonsLoading
                  ? "Chargement…"
                  : editingSportingPath
                    ? "Annuler"
                    : "Gérer le parcours"}
              </button>
            </div>

            {editingSportingPath && (
              <form
                className="entity-form league-club-sporting-form"
                onSubmit={saveSportingPath}
              >
                <label>
                  Saison
                  <select
                    name="seasonId"
                    required
                    value={selectedSeasonId}
                    onChange={(event) =>
                      setSelectedSeasonId(event.target.value)
                    }
                  >
                    <option value="" disabled>
                      Sélectionner
                    </option>
                    {seasons.map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name} — {season.status}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Division
                  <select
                    key={`division-${selectedSeasonId}`}
                    name="division"
                    required
                    defaultValue={String(sportingSeasonValue("division"))}
                  >
                    <option value="LIGUE_1">Ligue 1</option>
                    <option value="LIGUE_2">Ligue 2</option>
                  </select>
                </label>

                <label>
                  Classement final
                  <input
                    key={`rank-${selectedSeasonId}`}
                    name="finalRank"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue={String(sportingSeasonValue("finalRank"))}
                    placeholder="Ex. 1"
                  />
                </label>

                <label>
                  Issue
                  <select
                    key={`outcome-${selectedSeasonId}`}
                    name="outcome"
                    defaultValue={String(sportingSeasonValue("outcome"))}
                  >
                    <option value="">En cours / non renseignée</option>
                    <option value="MAINTAINED">Maintien</option>
                    <option value="PROMOTED">Montée</option>
                    <option value="RELEGATED">Relégation</option>
                    <option value="WITHDRAWN">Retrait</option>
                    <option value="EXCLUDED">Exclusion</option>
                  </select>
                </label>

                <label className="league-club-sporting-notes">
                  Notes
                  <input
                    key={`notes-${selectedSeasonId}`}
                    name="notes"
                    maxLength={1000}
                    defaultValue={String(sportingSeasonValue("notes"))}
                    placeholder="Décision, observation, contexte…"
                  />
                </label>

                <div className="league-club-form-actions">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving ? "Enregistrement…" : "Enregistrer le parcours"}
                  </button>
                </div>
              </form>
            )}

            <section className="league-club-summary">
              <div>
                <span>SAISONS</span>
                <strong>
                  {selectedClub.club.sportingSummary?.totalSeasons ?? 0}
                </strong>
              </div>
              <div>
                <span>LIGUE 1</span>
                <strong>
                  {selectedClub.club.sportingSummary?.league1Seasons ?? 0}
                </strong>
              </div>
              <div>
                <span>LIGUE 2</span>
                <strong>
                  {selectedClub.club.sportingSummary?.league2Seasons ?? 0}
                </strong>
              </div>
              <div>
                <span>1RES PLACES</span>
                <strong>
                  {selectedClub.club.sportingSummary?.titles ?? 0}
                </strong>
              </div>
              <div>
                <span>MONTÉES</span>
                <strong>
                  {selectedClub.club.sportingSummary?.promotions ?? 0}
                </strong>
              </div>
              <div>
                <span>RELÉGATIONS</span>
                <strong>
                  {selectedClub.club.sportingSummary?.relegations ?? 0}
                </strong>
              </div>
            </section>

            <div className="league-club-history-list">
              {(selectedClub.club.seasons ?? []).length === 0 ? (
                <p>Aucun parcours sportif enregistré.</p>
              ) : (
                (selectedClub.club.seasons ?? []).map((entry) => (
                  <div className="league-club-history-row" key={entry.id}>
                    <div>
                      <strong>{entry.season.name}</strong>
                      <small>{divisionLabel(entry.division)}</small>
                    </div>

                    <div>
                      <strong>
                        {entry.finalRank
                          ? `${entry.finalRank}${entry.finalRank === 1 ? "er" : "e"}`
                          : "En cours"}
                      </strong>
                      <small>{outcomeLabel(entry.outcome)}</small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="league-club-section">
            <div className="league-club-section-heading">
              <div>
                <span>VIE DU CLUB</span>
                <h3>Mouvements administratifs</h3>
              </div>
            </div>

            <div className="league-club-timeline">
              {(selectedClub.club.historyEvents ?? []).length === 0 ? (
                <p>Aucun événement administratif enregistré.</p>
              ) : (
                (selectedClub.club.historyEvents ?? []).map((event) => (
                  <div className="league-club-timeline-item" key={event.id}>
                    <div className="league-club-timeline-date">
                      {formatDate(event.effectiveDate)}
                    </div>

                    <div>
                      <strong>{event.title}</strong>

                      {event.previousValue && event.newValue && (
                        <p>
                          {event.previousValue} → {event.newValue}
                        </p>
                      )}

                      {!event.previousValue && event.newValue && (
                        <p>{event.newValue}</p>
                      )}

                      {event.reason && <small>{event.reason}</small>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </article>
      )}
    </section>
  );
}
