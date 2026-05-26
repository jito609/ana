import React, { useMemo, useState } from "react";
import "./styles.css";

const NUMBERS = [0, 1, 2, 3, 4, 5, 6];

const SEATS = [
  { id: "leftOpponent", label: "Left Opponent", type: "opponent" },
  { id: "partner", label: "Partner", type: "partner" },
  { id: "rightOpponent", label: "Right Opponent", type: "opponent" },
];

const DEFAULT_HAND = ["6-6", "6-4", "4-2", "3-3", "2-2", "5-2", "1-0"];

const DEFAULT_CLUES = {
  leftOpponent: { knownTiles: [], passed: [], strong: [], weak: [] },
  partner: { knownTiles: [], passed: [], strong: [], weak: [] },
  rightOpponent: { knownTiles: [], passed: [], strong: [], weak: [] },
};

function buildFullSet() {
  const tiles = [];
  for (let high = 0; high <= 6; high += 1) {
    for (let low = 0; low <= high; low += 1) {
      tiles.push(`${high}-${low}`);
    }
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

function normalizeTile(a, b) {
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return "";
  return x >= y ? `${x}-${y}` : `${y}-${x}`;
}

function countNumberInTiles(tiles, number) {
  return tiles.reduce((total, tile) => {
    const [a, b] = parseTile(tile);
    return total + (a === number ? 1 : 0) + (b === number ? 1 : 0);
  }, 0);
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

function removeOneTile(hand, tileToRemove) {
  let removed = false;
  return hand.filter((tile) => {
    if (!removed && tile === tileToRemove) {
      removed = true;
      return false;
    }
    return true;
  });
}

function getUnknownTiles(myHand, knownTiles, playedTiles) {
  const known = new Set([...myHand, ...knownTiles, ...playedTiles]);
  return FULL_SET.filter((tile) => !known.has(tile));
}

function playerClueScoreForNumber(clue, number, role) {
  let score = 0;
  const notes = [];

  if (clue.passed.includes(number)) {
    if (role === "opponent") {
      score += 16;
      notes.push(`opponent passed on ${number}`);
    } else {
      score -= 14;
      notes.push(`partner passed on ${number}`);
    }
  }

  if (clue.weak.includes(number)) {
    if (role === "opponent") {
      score += 10;
      notes.push(`opponent looks weak in ${number}s`);
    } else {
      score -= 8;
      notes.push(`partner looks weak in ${number}s`);
    }
  }

  if (clue.strong.includes(number)) {
    if (role === "opponent") {
      score -= 12;
      notes.push(`opponent may be strong in ${number}s`);
    } else {
      score += 10;
      notes.push(`partner may be strong in ${number}s`);
    }
  }

  const knownCount = countNumberInTiles(clue.knownTiles, number);
  if (knownCount > 0) {
    if (role === "opponent") {
      score -= knownCount * 8;
      notes.push(`opponent has known ${number} tile(s)`);
    } else {
      score += knownCount * 8;
      notes.push(`partner has known ${number} tile(s)`);
    }
  }

  return { score, notes };
}

function analyzeMove({
  move,
  myHand,
  leftEnd,
  rightEnd,
  clues,
  playedTiles,
  gameMode,
  scoreUs,
  scoreThem,
}) {
  const remainingHand = removeOneTile(myHand, move.tile);
  const newEnds = getNewEnds(move, leftEnd, rightEnd);
  const exposed = [newEnds.left, newEnds.right];
  const knownClueTiles = Object.values(clues).flatMap((clue) => clue.knownTiles);
  const unknownTiles = getUnknownTiles(myHand, knownClueTiles, playedTiles);

  let score = 50;
  const reasons = [];
  const warnings = [];
  const tags = [];

  const playedPips = tilePips(move.tile);
  const remainingPips = remainingHand.reduce((sum, tile) => sum + tilePips(tile), 0);
  const followUps = exposed.reduce((sum, n) => sum + countNumberInTiles(remainingHand, n), 0);

  score += Math.min(20, playedPips * 1.5);
  if (playedPips >= 9) {
    reasons.push("drops high pips so you are safer if the hand blocks");
    tags.push("Pip dump");
  }

  if (isDouble(move.tile)) {
    score += 5;
    reasons.push("gets a double out while it is playable");
    tags.push("Double");
  }

  if (remainingHand.length === 0) {
    score += 100;
    reasons.push("this gets you out immediately");
    tags.push("Win now");
  }

  if (followUps >= 2) {
    score += 16;
    reasons.push("keeps you with multiple follow-up plays on the new ends");
    tags.push("Follow-up");
  } else if (followUps === 1) {
    score += 6;
    reasons.push("keeps at least one follow-up path");
  } else {
    score -= 14;
    warnings.push("you may be stuck if the board comes back the same way");
    tags.push("Risky");
  }

  exposed.forEach((number) => {
    const myCount = countNumberInTiles(remainingHand, number);
    const unknownCount = countNumberInTiles(unknownTiles, number);

    if (myCount >= 2) {
      score += 13;
      reasons.push(`keeps control of ${number}s in your hand`);
      tags.push(`${number} control`);
    }

    if (myCount === 0 && unknownCount >= 5) {
      score -= 8;
      warnings.push(`opens ${number}s even though you do not control them`);
    }

    if (unknownCount <= 2) {
      score += 8;
      reasons.push(`${number}s look tight because few unknown ${number} tiles remain`);
      tags.push("Tight board");
    }

    SEATS.forEach((seat) => {
      const result = playerClueScoreForNumber(clues[seat.id], number, seat.type);
      score += result.score;
      result.notes.forEach((note) => {
        if (result.score >= 0) reasons.push(note);
        else warnings.push(note);
      });
    });
  });

  const target = gameMode === "pr500" ? 500 : 200;
  const usNeed = target - Number(scoreUs || 0);
  const themNeed = target - Number(scoreThem || 0);

  if (themNeed <= 50 && playedPips >= 8) {
    score += 8;
    reasons.push("opponents are close to winning, so dumping pips matters");
  }

  if (usNeed <= 50 && followUps > 0) {
    score += 8;
    reasons.push("your team is close to winning, so staying playable matters");
  }

  if (gameMode === "pr500" && newEnds.left === newEnds.right) {
    score += 7;
    reasons.push("creates matching ends, which can set up capi pressure");
    tags.push("Capi setup");
  }

  if (remainingHand.length <= 2) {
    score += followUps * 8;
    if (remainingPips <= 6) reasons.push("leaves you light for the endgame");
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
    tags: [...new Set(tags)].slice(0, 5),
    reasons: [...new Set(reasons)].slice(0, 6),
    warnings: [...new Set(warnings)].slice(0, 5),
  };
}

function analyzePosition(input) {
  const legalMoves = getLegalMoves(input.myHand, input.leftEnd, input.rightEnd);

  if (!legalMoves.length) {
    return {
      best: null,
      backup: null,
      avoid: null,
      moves: [],
      message: "No legal move. You should pass from this position.",
    };
  }

  const moves = legalMoves
    .map((move) => analyzeMove({ ...input, move }))
    .sort((a, b) => b.score - a.score);

  return {
    best: moves[0],
    backup: moves[1] || null,
    avoid: moves[moves.length - 1] || null,
    moves,
    message: "",
  };
}

function Tile({ tile, onClick, disabled = false }) {
  return (
    <button className="tile" type="button" onClick={onClick} disabled={disabled}>
      <span>{parseTile(tile)[0]}</span>
      <i />
      <span>{parseTile(tile)[1]}</span>
    </button>
  );
}

function NumberSelect({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">?</option>
        {NUMBERS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}

function NumberToggles({ values, onChange }) {
  function toggle(num) {
    onChange(values.includes(num) ? values.filter((x) => x !== num) : [...values, num]);
  }

  return (
    <div className="num-row">
      {NUMBERS.map((num) => (
        <button
          key={num}
          type="button"
          className={values.includes(num) ? "num active" : "num"}
          onClick={() => toggle(num)}
        >
          {num}
        </button>
      ))}
    </div>
  );
}

function TilePicker({ usedTiles, onPick }) {
  return (
    <div className="tile-grid">
      {FULL_SET.map((tile) => (
        <Tile key={tile} tile={tile} disabled={usedTiles.has(tile)} onClick={() => onPick(tile)} />
      ))}
    </div>
  );
}

function MyHandPanel({ myHand, setMyHand, usedTiles }) {
  function addTile(tile) {
    if (usedTiles.has(tile)) return;
    setMyHand((current) => [...current, tile]);
  }

  function removeTile(index) {
    setMyHand((current) => current.filter((_, i) => i !== index));
  }

  return (
    <section className="panel focus-panel">
      <div className="section-head">
        <div>
          <p className="step">Step 1</p>
          <h2>Your hand</h2>
        </div>
        <button className="mini danger" type="button" onClick={() => setMyHand([])}>Clear</button>
      </div>

      <div className="hand-zone">
        {myHand.length ? (
          myHand.map((tile, index) => (
            <Tile key={`${tile}-${index}`} tile={tile} onClick={() => removeTile(index)} />
          ))
        ) : (
          <div className="empty">Tap tiles below to add your hand.</div>
        )}
      </div>

      <details className="picker">
        <summary>Add tiles to my hand</summary>
        <TilePicker usedTiles={usedTiles} onPick={addTile} />
      </details>
    </section>
  );
}

function ClueCard({ seat, clue, updateClue, usedTiles }) {
  function setPart(part, value) {
    updateClue(seat.id, { ...clue, [part]: value });
  }

  function addKnownTile(tile) {
    if (usedTiles.has(tile)) return;
    setPart("knownTiles", [...clue.knownTiles, tile]);
  }

  function removeKnownTile(index) {
    setPart("knownTiles", clue.knownTiles.filter((_, i) => i !== index));
  }

  return (
    <section className="clue-card">
      <div className="clue-title">
        <h3>{seat.label}</h3>
        <p>{seat.type === "partner" ? "Help your partner if possible" : "Try not to feed them"}</p>
      </div>

      <div className="clue-block">
        <label>Known tiles you saw</label>
        <div className="mini-hand">
          {clue.knownTiles.length ? (
            clue.knownTiles.map((tile, index) => (
              <Tile key={`${tile}-${index}`} tile={tile} onClick={() => removeKnownTile(index)} />
            ))
          ) : (
            <span>No exact tiles known</span>
          )}
        </div>
        <details className="picker compact">
          <summary>Add known tile</summary>
          <TilePicker usedTiles={usedTiles} onPick={addKnownTile} />
        </details>
      </div>

      <div className="clue-block">
        <label>They passed on</label>
        <NumberToggles values={clue.passed} onChange={(value) => setPart("passed", value)} />
      </div>

      <div className="clue-block">
        <label>They seem strong in</label>
        <NumberToggles values={clue.strong} onChange={(value) => setPart("strong", value)} />
      </div>

      <div className="clue-block">
        <label>They seem weak in</label>
        <NumberToggles values={clue.weak} onChange={(value) => setPart("weak", value)} />
      </div>
    </section>
  );
}

function MoveSummary({ title, move }) {
  if (!move) return null;

  return (
    <div className="move-summary">
      <p>{title}</p>
      <strong>{tileLabel(move.tile)} on {move.side}</strong>
      <span>ends {move.newEnds.left}/{move.newEnds.right} · {move.score}/100</span>
    </div>
  );
}

export default function App() {
  const [myHand, setMyHand] = useState(DEFAULT_HAND);
  const [leftEnd, setLeftEnd] = useState("6");
  const [rightEnd, setRightEnd] = useState("2");
  const [playedText, setPlayedText] = useState("6-2");
  const [gameMode, setGameMode] = useState("pr500");
  const [scoreUs, setScoreUs] = useState(0);
  const [scoreThem, setScoreThem] = useState(0);
  const [clues, setClues] = useState(DEFAULT_CLUES);

  const playedTiles = useMemo(
    () =>
      playedText
        .split(/[,\s]+/)
        .map((x) => x.trim().replace("|", "-"))
        .filter(Boolean)
        .map((tile) => {
          const [a, b] = tile.split("-").map(Number);
          return normalizeTile(a, b);
        })
        .filter(Boolean),
    [playedText]
  );

  const usedTiles = useMemo(() => {
    const known = Object.values(clues).flatMap((clue) => clue.knownTiles);
    return new Set([...myHand, ...known, ...playedTiles]);
  }, [myHand, clues, playedTiles]);

  const analysis = useMemo(
    () =>
      analyzePosition({
        myHand,
        leftEnd,
        rightEnd,
        clues,
        playedTiles,
        gameMode,
        scoreUs,
        scoreThem,
      }),
    [myHand, leftEnd, rightEnd, clues, playedTiles, gameMode, scoreUs, scoreThem]
  );

  function updateClue(seatId, newValue) {
    setClues((current) => ({
      ...current,
      [seatId]: newValue,
    }));
  }

  function resetDemo() {
    setMyHand(DEFAULT_HAND);
    setLeftEnd("6");
    setRightEnd("2");
    setPlayedText("6-2");
    setGameMode("pr500");
    setScoreUs(0);
    setScoreThem(0);
    setClues(DEFAULT_CLUES);
  }

  return (
    <main className="app">
      <section className="hero">
        <div>
          <p className="eyebrow">Real-Life Domino Advisor</p>
          <h1>Enter your hand. Add clues. Get the best move.</h1>
          <p>
            You do not need to know everyone’s full hand. Add what you know: exact tiles you saw,
            passes, strong numbers, weak numbers, and partner clues.
          </p>
        </div>
        <button type="button" className="ghost" onClick={resetDemo}>Reset demo</button>
      </section>

      <section className="quick-grid">
        <div className="panel">
          <p className="step">Step 2</p>
          <h2>Board</h2>
          <div className="board-controls">
            <NumberSelect label="Left end" value={leftEnd} onChange={setLeftEnd} />
            <NumberSelect label="Right end" value={rightEnd} onChange={setRightEnd} />
          </div>

          <div className="board-preview">
            <div><small>Left</small><strong>{leftEnd || "?"}</strong></div>
            <span>open ends</span>
            <div><small>Right</small><strong>{rightEnd || "?"}</strong></div>
          </div>
        </div>

        <div className="panel">
          <p className="step">Optional</p>
          <h2>Score / played tiles</h2>
          <div className="score-grid">
            <label className="field">
              <span>Mode</span>
              <select value={gameMode} onChange={(e) => setGameMode(e.target.value)}>
                <option value="pr500">Puerto Rican 500</option>
                <option value="classic200">Classic 200</option>
              </select>
            </label>
            <label className="field">
              <span>Us</span>
              <input type="number" value={scoreUs} onChange={(e) => setScoreUs(e.target.value)} />
            </label>
            <label className="field">
              <span>Them</span>
              <input type="number" value={scoreThem} onChange={(e) => setScoreThem(e.target.value)} />
            </label>
          </div>
          <label className="field played">
            <span>Known played tiles</span>
            <input value={playedText} onChange={(e) => setPlayedText(e.target.value)} placeholder="6-2 2-4 4-0" />
          </label>
        </div>
      </section>

      <MyHandPanel myHand={myHand} setMyHand={setMyHand} usedTiles={usedTiles} />

      <section className="panel">
        <div className="section-head">
          <div>
            <p className="step">Step 3 optional</p>
            <h2>Clues about other players</h2>
          </div>
        </div>
        <div className="clue-grid">
          {SEATS.map((seat) => (
            <ClueCard
              key={seat.id}
              seat={seat}
              clue={clues[seat.id]}
              updateClue={updateClue}
              usedTiles={usedTiles}
            />
          ))}
        </div>
      </section>

      <section className="panel result-panel">
        <p className="step">Step 4</p>
        <h2>Best move</h2>

        {!analysis.best ? (
          <div className="empty result-empty">{analysis.message}</div>
        ) : (
          <>
            <div className="best">
              <div>
                <p className="eyebrow">Recommended</p>
                <h3>Play {tileLabel(analysis.best.tile)} on the {analysis.best.side} side</h3>
                <p>New ends: <strong>{analysis.best.newEnds.left}</strong> / <strong>{analysis.best.newEnds.right}</strong></p>
                <div className="tags">
                  {analysis.best.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
              <div className={`score-badge ${analysis.best.risk.toLowerCase()}`}>
                {analysis.best.score}/100<br />
                <small>{analysis.best.risk} risk</small>
              </div>
            </div>

            <div className="summary-row">
              <MoveSummary title="Backup" move={analysis.backup} />
              <MoveSummary title="Be careful" move={analysis.avoid} />
            </div>

            <div className="explain-grid">
              <div className="explain">
                <h4>Why</h4>
                <ul>
                  {analysis.best.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
              <div className="explain warn">
                <h4>Watch out</h4>
                {analysis.best.warnings.length ? (
                  <ul>
                    {analysis.best.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                ) : (
                  <p>No big warning found.</p>
                )}
              </div>
            </div>

            <details className="all-moves">
              <summary>Show all legal moves ranked</summary>
              <div className="rankings">
                {analysis.moves.map((move, index) => (
                  <div className="rank-row" key={`${move.tile}-${move.side}`}>
                    <strong>#{index + 1}</strong>
                    <span>{tileLabel(move.tile)} on {move.side}</span>
                    <span>Ends {move.newEnds.left}/{move.newEnds.right}</span>
                    <em>{move.score}/100</em>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </section>
    </main>
  );
}
