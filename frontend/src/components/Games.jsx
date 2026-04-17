// ── Games ──────────────────────────────────────────────────────────────────────
// Main games view: tab-switch between My Games list and Opening Explorer.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Filter, Search, ShieldAlert } from "lucide-react";
import axios from "axios";

import { useBoardColors } from "../hooks/useBoardColors";
import { useGameFetch } from "../hooks/useGameFetch";
import { formatMonth, groupByMonth } from "../utils/games";
import { ConfirmModal, GameCard, GameCardSkeleton, AggregateFairPlayPanel, PlayerFairPlayModal } from "./ui";
import AnalyzeModal from "./AnalyzeModal";
import OpeningExplorer from "./OpeningExplorer";
import { reconstructPgn } from "../utils/games";

// ── GameList ──────────────────────────────────────────────────────────────────

function GameList({
  setAnalysis,
  activeId,
  player,
  dateFrom,
  dateTo,
  source,
  analyzedOnly,
}) {
  const navigate = useNavigate();
  const boardColors = useBoardColors();
  const { games, loading, updateResult } = useGameFetch({
    dateFrom,
    dateTo,
    player,
    source,
    analyzedOnly,
  });
  const [hoveredId, setHoveredId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [analyzeTarget, setAnalyzeTarget] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showAggregate, setShowAggregate] = useState(false);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const initiateDelete = (g) =>
    setConfirmDelete({ id: g.id, title: g.title, uuid: g.uuid || "" });

  const buildAnalysisFromMoves = (moves) =>
    moves.map((m) => ({
      move_number: m.ply,
      label: `${m.moveNumber}${m.color}`,
      san: m.san,
      evaluation: m.evaluation?.value ?? 0,
      cpl: m.annotations?.cpl ?? 0,
      is_blunder: m.annotations?.isBlunder ?? false,
      phase: m.annotations?.phase ?? "",
      time_spent: m.time?.moveDurationSeconds ?? 0,
      best_move: m.engine?.bestMove ?? null,
      pv_san: m.engine?.pv ?? [],
    }));

  const loadGame = async (id) => {
    const res = await axios.get(`/api/db/games/${id}`);
    const g = res.data;
    const analysis = buildAnalysisFromMoves(g.moves || []);
    const hasEval = analysis.some((m) => m.best_move || m.cpl > 0);
    if (!hasEval) {
      setAnalyzeTarget(g);
      return;
    }
    setAnalysis({
      id,
      title: g.title || g.metadata?.event || "Game",
      uuid: g.uuid,
      pgn: g.raw_pgn || "",
      analysis,
      depth: g.analysis_depth || null,
      metadata: g.metadata,
    });
    navigate("/review");
  };

  const handleAnalysisComplete = (data, depth) => {
    const analysis = (data.analysis || []).map((a) => ({
      move_number: a.move_number,
      label: a.label,
      san: a.san,
      evaluation: a.eval_cp ?? a.evaluation ?? 0,
      cpl: a.cpl ?? 0,
      is_blunder: a.is_blunder ?? false,
      phase: a.phase ?? "",
      time_spent: a.time_spent ?? 0,
      best_move: a.best_move_san ?? null,
      pv_san: a.pv_san ?? [],
    }));
    setAnalysis({
      id: analyzeTarget.id,
      title: analyzeTarget.title || analyzeTarget.metadata?.event || "Game",
      uuid: analyzeTarget.uuid,
      pgn: data.pgn || analyzeTarget.raw_pgn || reconstructPgn(analyzeTarget),
      analysis,
      depth,
      metadata: analyzeTarget.metadata,
    });
    setAnalyzeTarget(null);
    navigate("/review");
  };

  const confirmAndDelete = async () => {
    if (!confirmDelete) return;
    await axios.delete(`/api/db/games/${confirmDelete.id}`);
    await updateResult(confirmDelete.id, null);
    setConfirmDelete(null);
  };

  const editGame = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await axios.get(`/api/db/games/${id}`);
      const gameData = res.data;
      navigate("/upload", {
        state: {
          pgn: reconstructPgn(gameData),
          title: gameData.title || "",
          gameId: id,
          gameUuid: gameData.uuid,
        },
      });
    } catch (err) {
      console.error("Failed to load game for editing", err);
    }
  };

  const grouped = groupByMonth(games);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {showAggregate && selectedIds.size > 0 && (
        <AggregateFairPlayPanel
          gameIds={Array.from(selectedIds)}
          side="opponent"
          onClose={() => setShowAggregate(false)}
        />
      )}

      {selectedIds.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--bg-elevated)", border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius-md)", padding: "8px 14px",
          marginBottom: "var(--space-md)", fontSize: 13,
        }}>
          <span style={{ flex: 1, color: "var(--text-secondary)" }}>
            {selectedIds.size} game{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <button
            className="btn btn-primary"
            style={{ padding: "4px 12px", fontSize: 12 }}
            onClick={() => setShowAggregate(true)}
          >
            Analyze for Fair Play
          </button>
          <button
            className="btn btn-secondary"
            style={{ padding: "4px 10px", fontSize: 12 }}
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Game"
          message={`"${confirmDelete?.title}" (ID: ...${confirmDelete?.uuid?.slice(-4)}) will be permanently removed.`}
          onConfirm={confirmAndDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {analyzeTarget && (
        <AnalyzeModal
          game={analyzeTarget}
          onCancel={() => setAnalyzeTarget(null)}
          onComplete={handleAnalysisComplete}
        />
      )}

      {loading && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
          }}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <GameCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && games.length === 0 && (
        <div
          className="card"
          style={{
            textAlign: "center",
            color: "var(--text-secondary)",
            padding: "var(--space-xl)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: "var(--space-md)" }}>♟</div>
          <div style={{ marginBottom: "var(--space-md)" }}>No games yet.</div>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/upload")}
          >
            Import Your First Game
          </button>
        </div>
      )}

      {grouped.map(([monthKey, dayGames]) => (
        <div key={monthKey} style={{ marginBottom: "var(--space-xl)" }}>
          <div
            className="field-label"
            style={{ paddingLeft: 2, marginBottom: "var(--space-sm)" }}
          >
            {formatMonth(monthKey)} · {dayGames.length} game
            {dayGames.length !== 1 ? "s" : ""}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-sm)",
            }}
          >
            {dayGames.map((g) => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(g.id)}
                  onChange={(e) => toggleSelect(g.id, e)}
                  style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer", accentColor: "var(--accent)" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <GameCard
                    g={g}
                    boardColors={boardColors}
                    hoveredId={hoveredId}
                    activeId={activeId}
                    onLoad={loadGame}
                    onEdit={editGame}
                    onDeep={setAnalyzeTarget}
                    onDelete={initiateDelete}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Games ────────────────────────────────────────────────────────────────

export default function Games({ setAnalysis, analysis }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("list");
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [player, setPlayer] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [source, setSource] = useState(
    () => localStorage.getItem("games_filter_source") || "",
  );
  const [analyzedOnly, setAnalyzedOnly] = useState(
    () => localStorage.getItem("games_filter_analyzed") === "true",
  );
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    localStorage.setItem("games_filter_source", source);
  }, [source]);
  useEffect(() => {
    localStorage.setItem("games_filter_analyzed", String(analyzedOnly));
  }, [analyzedOnly]);

  const activeFilterCount = [
    source,
    analyzedOnly,
    player,
    dateFrom,
    dateTo,
  ].filter(Boolean).length;

  useEffect(() => {
    if (!showFilters) return;
    const handler = () => setShowFilters(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showFilters]);

  return (
    <div>
      {showPlayerModal && (
        <PlayerFairPlayModal onClose={() => setShowPlayerModal(false)} />
      )}
      <div className="games-appbar">
        <button
          className={`btn ${tab === "list" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("list")}
        >
          My Games
        </button>
        <button
          className={`btn ${tab === "explorer" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setTab("explorer")}
        >
          Opening Tree
        </button>
        <button
          className="btn btn-secondary"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", fontSize: 12, flexShrink: 0 }}
          onClick={() => setShowPlayerModal(true)}
        >
          <ShieldAlert size={13} />
          Check a Player
        </button>

        {tab === "list" && (
          <>
            <div className="appbar-divider" />
            <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
              <Search
                style={{
                  position: "absolute",
                  left: 10,
                  top: 9,
                  width: 14,
                  height: 14,
                  opacity: 0.4,
                }}
              />
              <input
                className="appbar-input"
                style={{ paddingLeft: 30, width: "100%" }}
                placeholder="Search players…"
                value={player}
                onChange={(e) => setPlayer(e.target.value)}
              />
            </div>
            <div className="appbar-divider" />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-dim)",
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }}>
                From
              </span>
              <input
                type="text"
                className="appbar-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="YYYY-MM-DD"
                style={{ width: 100 }}
              />
            </div>
            <div className="appbar-divider" />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-dim)",
                borderRadius: 6,
                padding: "3px 8px",
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }}>
                To
              </span>
              <input
                type="text"
                className="appbar-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="YYYY-MM-DD"
                style={{ width: 100 }}
              />
            </div>
            {(player || dateFrom || dateTo) && (
              <button
                className="btn btn-secondary"
                style={{ padding: "3px 10px", fontSize: 12 }}
                onClick={() => {
                  setPlayer("");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Clear
              </button>
            )}
            <div className="appbar-divider" />
            <div style={{ position: "relative" }}>
              <button
                className={`btn ${activeFilterCount > 0 ? "btn-primary" : "btn-secondary"}`}
                style={{
                  padding: "3px 10px",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFilters((f) => !f);
                }}
              >
                <Filter size={13} />
                {activeFilterCount > 0
                  ? `Filters · ${activeFilterCount}`
                  : "Filters"}
              </button>
              {showFilters && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 6px)",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-dim)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-md)",
                    zIndex: 200,
                    minWidth: 220,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      marginBottom: "var(--space-sm)",
                    }}
                  >
                    Source
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      marginBottom: "var(--space-md)",
                    }}
                  >
                    {[
                      ["", "All games"],
                      ["online", "Online only"],
                      ["local", "Local/manual only"],
                    ].map(([val, label]) => (
                      <label
                        key={val}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          fontSize: 13,
                          padding: "4px 2px",
                        }}
                      >
                        <input
                          type="radio"
                          name="source"
                          value={val}
                          checked={source === val}
                          onChange={() => {
                            setSource(val);
                            setShowFilters(false);
                          }}
                          style={{ accentColor: "var(--accent)" }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      marginBottom: "var(--space-sm)",
                    }}
                  >
                    Analysis
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      fontSize: 13,
                      padding: "4px 2px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={analyzedOnly}
                      onChange={(e) => {
                        setAnalyzedOnly(e.target.checked);
                        setShowFilters(false);
                      }}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    Analyzed only
                  </label>
                  {(source || analyzedOnly) && (
                    <button
                      className="btn btn-secondary"
                      style={{
                        width: "100%",
                        marginTop: "var(--space-md)",
                        fontSize: 12,
                        padding: "4px",
                      }}
                      onClick={() => {
                        setSource("");
                        setAnalyzedOnly(false);
                        setShowFilters(false);
                      }}
                    >
                      Clear source & analysis
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {tab === "list" ? (
        <GameList
          setAnalysis={setAnalysis}
          activeId={analysis?.id}
          player={player}
          dateFrom={dateFrom}
          dateTo={dateTo}
          source={source}
          analyzedOnly={analyzedOnly}
        />
      ) : (
        <OpeningExplorer />
      )}
    </div>
  );
}
