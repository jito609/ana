import React, { useMemo, useState } from "react";
import "./styles.css";

const NUMBERS = [0, 1, 2, 3, 4, 5, 6];

const PLAYERS = [
  { id: "me", label: "Me", team: "us" },
  { id: "leftOpponent", label: "Left Opponent", team: "them" },
  { id: "partner", label: "Partner", team: "us" },
  { id: "rightOpponent", label: "Right Opponent", team: "them" },
];

const DEFAULT_HANDS = {
  me: ["6-6", "6-4", "4-2", "3-3", "2-2", "5-2", "1-0"],
  partner: ["6-5", "5-5", "4-4", "3-1", "2-0", "1-1", "0-0"],
  leftOpponent: ["6-3", "6-1", "5-4", "5-0", "4-1", "3-2", "2-1"],
  rightOpponent: ["6-2", "6-0", "5-3", "4-3", "4-0", "3-0", "2-2"],
};

function buildFullSet() {
  const tiles = [];
  for (let high = 0; high <= 6; high += 1) {
    for (let low = 0; low <= high; low += 1) tiles.push(`${high}-${low}`);
  }
  return tiles;
}

const FULL_SET = buildFullSet();

function parseTile(tile) {
  return tile.split("-").map(Number);
}

function tileLabel(tile) {
  return tile.replace("-", "|");
}

function tilePips(tile) {
  const [a, b] = parseTile(tile);
  return a + b;
}

function isDouble(tile) {
  const [a, b] = parseTile(tile);
  return a === b;
}

function legalSides(tile, leftEnd, rightEnd) {
  const [a, b] = parseTile(tile);
  const sides = [];
  if (a === Number(leftEnd) || b === Number(leftEnd)) sides.push("left");
  if (a === Number(rightEnd) || b === Number(rightEnd)) sides.push("right");
  return sides;
}

function getLegalMoves(hand, leftEnd, rightEnd) {
  if (leftEnd === "" || rightEnd === "") return [];
  return hand.flatMap((tile) =>
    legalSides(tile, leftEnd, rightEnd).map((side) => ({
      tile,
      side,
      playedOn: side === "left" ? Number(leftEnd) : Number(rightEnd),
    }))
  );
}

function getNewEnds(move, leftEnd, rightEnd) {
  const [a, b] = parseTile(move.tile);
  const playedOn = move.side === "left" ? Number(leftEnd) : Number(rightEnd);
  const newNumber = a === playedOn ? b : a;
  if (move.side === "left") return { left: newNumber, right: Number(rightEnd) };
  return { left: Number(leftEnd), right: newNumber };
}

function countNumberInTiles(tiles, number) {
  return tiles.reduce((total, tile) => {
    const [a, b] = parseTile(tile);
    return total + (a === number ? 1 : 0) + (b === number ? 1 : 0);
  }, 0);
}

function getNextPlayerId(currentPlayerId) {
  const index = PLAYERS.findIndex((p) => p.id === currentPlayerId);
  return PLAYERS[(index + 1) % PLAYERS.length].id;
}

function getPlayerLabel(playerId) {
  return PLAYERS.find((p) => p.id === playerId)?.label || playerId;
}

function getPlayerTeam(playerId) {
  return PLAYERS.find((p) => p.id === playerId)?.team || "them";
}

function getOpponentIds(playerId) {
  const myTeam = getPlayerTeam(playerId);
  return PLAYERS.filter((p) => p.team !== myTeam).map((p) => p.id);
}

function getPartnerId(playerId) {
  const myTeam = getPlayerTeam(playerId);
  return PLAYERS.find((p) => p.team === myTeam && p.id !== playerId)?.id;
}

function remainingHandAfterMove(hand, tile) {
  let removed = false;
  return hand.filter((t) => {
    if (!removed && t === tile) {
      removed = true;
      return false;
    }
    return true;
  });
}

function playerCanPlay(hand, leftEnd, rightEnd) {
  return getLegalMoves(hand, leftEnd, rightEnd).length > 0;
}

function bestReplyForPlayer(hand, leftEnd, rightEnd) {
  const legal = getLegalMoves(hand, leftEnd, rightEnd);
  if (!legal.length) return null;
  return legal
    .map((move) => ({ ...move, pips: tilePips(move.tile), newEnds: getNewEnds(move, leftEnd, rightEnd) }))
    .sort((a, b) => b.pips - a.pips)[0];
}

function analyzeMove({ move, hands, currentPlayerId, leftEnd, rightEnd, gameMode, scoreUs, scoreThem }) {
  const currentHand = hands[currentPlayerId] || [];
  const newEnds = getNewEnds(move, leftEnd, rightEnd);
  const exposed = [newEnds.left, newEnds.right];
  const nextPlayerId = getNextPlayerId(currentPlayerId);
  const partnerId = getPartnerId(currentPlayerId);
  const opponentIds = getOpponentIds(currentPlayerId);

  const remainingCurrentHand = remainingHandAfterMove(currentHand, move.tile);
  const nextPlayerHand = hands[nextPlayerId] || [];
  const partnerHand = hands[partnerId] || [];
  const opponentHands = opponentIds.flatMap((id) => hands[id] || []);

  let score = 50;
  const reasons = [];
  const warnings = [];
  const threats = [];

  const playedPips = tilePips(move.tile);
  const remainingPips = remainingCurrentHand.reduce((sum, tile) => sum + tilePips(tile), 0);
  const followUps = exposed.reduce((sum, n) => sum + countNumberInTiles(remainingCurrentHand, n), 0);

  score += Math.min(20, playedPips * 1.5);
  if (playedPips >= 9) reasons.push("drops high pips so you are safer if the hand blocks");

  if (isDouble(move.tile)) {
    score += 5;
    reasons.push("gets a double out while it is playable");
  }

  if (remainingCurrentHand.length === 0) {
    score += 100;
    reasons.push("this wins the hand immediately");
  }

  if (followUps >= 2) {
    score += 16;
    reasons.push("keeps you with multiple follow-up plays on the new board ends");
  } else if (followUps === 1) {
    score += 6;
    reasons.push("keeps at least one follow-up path");
  } else {
    score -= 14;
    warnings.push("you may be stuck if the board comes back the same way");
  }

  exposed.forEach((number) => {
    const myCount = countNumberInTiles(remainingCurrentHand, number);
    const partnerCount = countNumberInTiles(partnerHand, number);
    const opponentCount = countNumberInTiles(opponentHands, number);
    const nextCount = countNumberInTiles(nextPlayerHand, number);

    if (myCount >= 2) {
      score += 12;
      reasons.push(`keeps control of ${number}s in your own hand`);
    }

    if (partnerCount >= 2) {
      score += 10;
      reasons.push(`helps your partner because they are strong in ${number}s`);
    }

    if (partnerCount === 0 && partnerId) {
      score -= 6;
      warnings.push(`does not help your partner on ${number}s`);
    }

    if (opponentCount === 0) {
      score += 18;
      reasons.push(`opponents have no ${number}s, so this can choke their team`);
    } else if (opponentCount >= 4) {
      score -= 12;
      warnings.push(`opponents are strong in ${number}s, so this may feed them`);
    }

    if (nextCount === 0) {
      score += 16;
      reasons.push(`${getPlayerLabel(nextPlayerId)} cannot answer ${number}`);
    } else if (nextCount >= 2) {
      score -= 14;
      warnings.push(`${getPlayerLabel(nextPlayerId)} has multiple ${number}s and may punish this`);
    }
  });

  const nextCanPlay = playerCanPlay(nextPlayerHand, newEnds.left, newEnds.right);
  if (!nextCanPlay) {
    score += 22;
    reasons.push(`this forces ${getPlayerLabel(nextPlayerId)} to pass`);
  } else {
    const reply = bestReplyForPlayer(nextPlayerHand, newEnds.left, newEnds.right);
    if (reply) {
      threats.push(`${getPlayerLabel(nextPlayerId)} can answer with ${tileLabel(reply.tile)} on ${reply.side}`);
      if (tilePips(reply.tile) >= 9) {
        score -= 10;
        warnings.push(`next player has a heavy reply available: ${tileLabel(reply.tile)}`);
      }
    }
  }

  const opponentCanGoOutSoon = opponentIds.some((id) => (hands[id] || []).length <= 2);
  const partnerCanGoOutSoon = partnerId && (hands[partnerId] || []).length <= 2;

  if (opponentCanGoOutSoon && !nextCanPlay) {
    score += 8;
    reasons.push("blocks pressure while an opponent is close to going out");
  }

  if (partnerCanGoOutSoon) {
    score += 8;
    reasons.push("your partner is close to going out, so helping their numbers matters");
  }

  if (remainingCurrentHand.length <= 2) {
    score += followUps * 8;
    if (remainingPips <= 6) reasons.push("leaves you very light for the endgame");
  }

  const target = gameMode === "pr500" ? 500 : 200;
  const usNeed = target - Number(scoreUs || 0);
  const themNeed = target - Number(scoreThem || 0);

  if (themNeed <= 50 && playedPips >= 8) {
    score += 8;
    reasons.push("opponents are close to winning, so dumping pips matters");
  }

  if (gameMode === "pr500" && newEnds.left === newEnds.right) {
    score += 7;
    reasons.push("creates matching ends, which can set up capi pressure");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let risk = "Medium";
  if (score >= 78) risk = "Low";
  if (score < 55) risk = "High";

  return {
    ...move,
    newEnds,
    score,
    risk,
    reasons: [...new Set(reasons)].slice(0, 6),
    warnings: [...new Set(warnings)].slice(0, 5),
    threats: [...new Set(threats)].slice(0, 3),
    remainingPips,
    nextCanPlay,
  };
}

function analyzePosition(input) {
  const hand = input.hands[input.currentPlayerId] || [];
  const legalMoves = getLegalMoves(hand, input.leftEnd, input.rightEnd);

  if (!legalMoves.length) {
    return { best: null, moves: [], message: `${getPlayerLabel(input.currentPlayerId)} has no legal move and must pass.` };
  }

  const moves = legalMoves.map((move) => analyzeMove({ ...input, move })).sort((a, b) => b.score - a.score);
  return { best: moves[0], worst: moves[moves.length - 1], moves, message: "" };
}

function TileButton({ tile, onClick, disabled = false, small = false }) {
  return (
    <button type="button" className={`tile ${small ? "small" : ""}`} disabled={disabled} onClick={onClick} title={tileLabel(tile)}>
      <span>{parseTile(tile)[0]}</span>
      <i />
      <span>{parseTile(tile)[1]}</span>
    </button>
  );
}

function HandPanel({ player, tiles, setHands, usedTiles }) {
  function removeTile(tile) {
    setHands((current) => ({ ...current, [player.id]: current[player.id].filter((t) => t !== tile) }));
  }

  function addTile(tile) {
    if (usedTiles.has(tile)) return;
    setHands((current) => ({ ...current, [player.id]: [...current[player.id], tile] }));
  }

  function clearHand() {
    setHands((current) => ({ ...current, [player.id]: [] }));
  }

  return (
    <div className={`hand-panel ${player.team}`}>
      <div className="hand-head">
        <div>
          <h3>{player.label}</h3>
          <p>{player.team === "us" ? "Your team" : "Opponent team"} · {tiles.length} tiles</p>
        </div>
        <button type="button" className="mini danger" onClick={clearHand}>Clear</button>
      </div>

      <div className="hand-tiles">
        {tiles.length ? tiles.map((tile, index) => (
          <TileButton key={`${tile}-${index}`} tile={tile} onClick={() => removeTile(tile)} small />
        )) : <div className="empty-hand">No tiles added</div>}
      </div>

      <details className="tile-picker">
        <summary>Add tile</summary>
        <div className="full-set">
          {FULL_SET.map((tile) => (
            <TileButton key={tile} tile={tile} small disabled={usedTiles.has(tile)} onClick={() => addTile(tile)} />
          ))}
        </div>
      </details>
    </div>
  );
}

function NumberSelect({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose</option>
        {NUMBERS.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}

export default function App() {
  const [hands, setHands] = useState(DEFAULT_HANDS);
  const [currentPlayerId, setCurrentPlayerId] = useState("me");
  const [leftEnd, setLeftEnd] = useState("6");
  const [rightEnd, setRightEnd] = useState("2");
  const [gameMode, setGameMode] = useState("pr500");
  const [scoreUs, setScoreUs] = useState(0);
  const [scoreThem, setScoreThem] = useState(0);

  const usedTiles = useMemo(() => new Set(Object.values(hands).flat()), [hands]);

  const analysis = useMemo(
    () => analyzePosition({ hands, currentPlayerId, leftEnd, rightEnd, gameMode, scoreUs, scoreThem }),
    [hands, currentPlayerId, leftEnd, rightEnd, gameMode, scoreUs, scoreThem]
  );

  function resetDemo() {
    setHands(DEFAULT_HANDS);
    setCurrentPlayerId("me");
    setLeftEnd("6");
    setRightEnd("2");
    setGameMode("pr500");
    setScoreUs(0);
    setScoreThem(0);
  }

  function clearAll() {
    setHands({ me: [], partner: [], leftOpponent: [], rightOpponent: [] });
  }

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Domino Full Table Analyzer</p>
          <h1>Enter all four hands. Get the best next play.</h1>
          <p>This version does not guess. You manually input every player’s tiles, choose whose turn it is, set the board ends, and the app ranks the best legal play.</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="ghost" onClick={resetDemo}>Reset demo</button>
          <button type="button" className="ghost danger" onClick={clearAll}>Clear all hands</button>
        </div>
      </section>

      <section className="setup panel">
        <h2>Board and turn</h2>
        <div className="setup-grid">
          <NumberSelect label="Left board end" value={leftEnd} onChange={setLeftEnd} />
          <NumberSelect label="Right board end" value={rightEnd} onChange={setRightEnd} />
          <label className="field"><span>Whose turn?</span><select value={currentPlayerId} onChange={(e) => setCurrentPlayerId(e.target.value)}>{PLAYERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className="field"><span>Game mode</span><select value={gameMode} onChange={(e) => setGameMode(e.target.value)}><option value="pr500">Puerto Rican 500</option><option value="classic200">Classic 200</option></select></label>
          <label className="field"><span>Your team score</span><input type="number" value={scoreUs} onChange={(e) => setScoreUs(e.target.value)} /></label>
          <label className="field"><span>Opponent score</span><input type="number" value={scoreThem} onChange={(e) => setScoreThem(e.target.value)} /></label>
        </div>

        <div className="board">
          <div className="end-card"><small>Left</small><strong>{leftEnd || "?"}</strong></div>
          <div className="table-line"><span>{getPlayerLabel(currentPlayerId)} to play</span></div>
          <div className="end-card"><small>Right</small><strong>{rightEnd || "?"}</strong></div>
        </div>
      </section>

      <section className="hands-grid">
        {PLAYERS.map((player) => <HandPanel key={player.id} player={player} tiles={hands[player.id]} setHands={setHands} usedTiles={usedTiles} />)}
      </section>

      <section className="results panel">
        <h2>Best next play</h2>
        {!analysis.best ? <div className="empty-result">{analysis.message}</div> : (
          <>
            <div className="best-card">
              <div>
                <p className="eyebrow">Recommended move</p>
                <h3>{getPlayerLabel(currentPlayerId)} should play <span>{tileLabel(analysis.best.tile)}</span> on the {analysis.best.side} side</h3>
                <p>New board ends: <strong>{analysis.best.newEnds.left}</strong> and <strong>{analysis.best.newEnds.right}</strong></p>
              </div>
              <div className={`risk ${analysis.best.risk.toLowerCase()}`}>{analysis.best.score}/100 · {analysis.best.risk} risk</div>
            </div>

            <div className="explain-grid">
              <div className="explain"><h4>Why this is best</h4><ul>{analysis.best.reasons.length ? analysis.best.reasons.map((reason) => <li key={reason}>{reason}</li>) : <li>It is the strongest legal move from the exact tiles entered.</li>}</ul></div>
              <div className="explain warning-box"><h4>Warnings / possible punishment</h4>{analysis.best.warnings.length || analysis.best.threats.length ? <ul>{[...analysis.best.warnings, ...analysis.best.threats].map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>No major punishment found from the next player.</p>}</div>
            </div>

            <h3 className="rank-title">All legal moves ranked</h3>
            <div className="rankings">
              {analysis.moves.map((move, index) => <div className="rank-row" key={`${move.tile}-${move.side}`}><strong>#{index + 1}</strong><span>{tileLabel(move.tile)} on {move.side}</span><span>Ends {move.newEnds.left}/{move.newEnds.right}</span><span>{move.score}/100</span><em className={`risk-text ${move.risk.toLowerCase()}`}>{move.risk}</em></div>)}
            </div>

            {analysis.worst && analysis.worst.tile !== analysis.best.tile && <div className="avoid"><h4>Move to be careful with</h4><p><strong>{tileLabel(analysis.worst.tile)} on {analysis.worst.side}</strong> ranked lowest because it creates more risk from the exact table position.</p></div>}
          </>
        )}
      </section>
    </main>
  );
}
